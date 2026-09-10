/**
 * 계층 군집화 (agglomerative hierarchical clustering) — 연결 방식이 나무를 바꾼다.
 *
 * 점 여덟을 가장 가까운 둘씩 일곱 번 합쳐 나무 하나를 짓는다. "가장 가까운" 을
 * 무엇으로 재느냐 — **단일**(점쌍 거리의 최솟값) · **완전**(최댓값) ·
 * **평균** — 가 이 facet 의 손잡이이고, 두 번째 손잡이인 **자르는 높이** 와
 * 맞물려 답을 정한다.
 *
 * ── 이 완제품의 주장
 *
 * 이 자료에는 두 덩이 사이에 점 둘(d · e)이 다리처럼 놓여 있다. 단일 연결은
 * 그 다리를 타고 이어 붙어(체이닝) 전부를 한 무리로 만들고, 완전·평균은 그러지
 * 않는다. 높이 2 에서 자르면 **단일 1 · 완전 3 · 평균 3** 이다.
 *
 * ── 진행 모델
 *
 * `ReactiveMechanism`. mount 직후 초기 연결 방식으로 일곱 걸음을 한 걸음씩
 * 자동 시연한 뒤 `waitForInput()` 으로 든다. 손잡이가 움직이면 **처음부터
 * 재생하지 않고** 그 값으로 다시 셈한 결과만 갈아 끼운다. 재생·멈춤·한 걸음은
 * 메커니즘이 `ctx.sleep` 경계에서 진다 — 알고리즘은 위젯 입력만 본다.
 *
 * ── 식별자 문법 (C1)
 *
 *   `cluster:<대표 번호>`   무리 하나. 대표는 그 무리에 든 점 번호의 최솟값이다.
 *
 * ── 발신 이벤트 (C2)
 *
 *   'phase'        { phase: string }                                    silent
 *   'merge-made'   { step, into, gone, height, groups, clusterCount }
 *                  target: ['cluster:<into>', 'cluster:<gone>']
 *   'tree-built'   { linkIndex, merges, distanceCount }
 *   'cut-changed'  { cutIndex, cutHeight, groups, clusterCount }
 *   'done'         { linkIndex, cutIndex, cutHeight, clusterCount, chained, textKey }
 *
 *   `groups` 는 길이 n 의 배열이고 `groups[p]` 는 지금 자르는 높이에서 점 p 가
 *   속한 무리의 대표 번호다. `merges` 는 `{ into, gone, height }` 일곱이다.
 *
 * ── 받는 입력 (control-bar 위젯 → mechanism.dispatch)
 *
 *   'set-link'  { segmentIndex: 0 | 1 | 2 }    단일 · 완전 · 평균
 *   'set-cut'   { segmentIndex: 0..5 }         자르는 높이
 *
 *   그 밖의 신호(speed 등)는 흘린다.
 *
 * ── phase 어휘 (C3, `irs.ts` 와 글자까지 같다)
 *
 *   'scan-pairs' | 'point-pair' | 'link-single' | 'link-complete' |
 *   'link-average' | 'pick-closest' | 'merge' | 'report'
 *
 * ── 메트릭 (C5)
 *
 *   'merge-count'     합친 횟수 (누적)
 *   'cluster-count'   지금 자르는 높이에서의 무리 수
 *   'distance-count'  점쌍 거리를 잰 횟수 (누적)
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HierarchicalPoint = { id: string; x: number; y: number };

/** 병합 한 걸음의 결과. `into` 가 살아남고 `gone` 이 흡수된다. */
export type HierarchicalMerge = { into: number; gone: number; height: number };

export type HierarchicalData = {
  type: string;
  points: HierarchicalPoint[];
  /** 두 덩이 사이에 다리처럼 놓인 점들의 이름표. 화면이 따로 표시한다. */
  bridgeIds: string[];
  cutHeights: number[];
  initialLinkIndex: number;
  initialCutIndex: number;
  /** 나무의 세로 눈금 최댓값. 세 방식을 같은 자로 재야 견줄 수 있다. */
  axisMax: number;
  timings: { mergeStepMs: number };
};

export type HierarchicalInputEvent = { type: string; payload?: unknown };

/** 연결 방식 셋. `irs.ts` 의 `mode` 인자와 같은 번호다. */
const LINK_COUNT = 3;

/**
 * 병합 한 걸음 — `irs.ts` 의 `merge_step` 과 같은 셈, 같은 차례.
 *
 * `member` 와 `alive` 를 제자리에서 갈아 끼우고 합친 쌍과 높이를 돌려준다.
 * `measured` 는 이 걸음에서 실제로 잰 점쌍 거리의 수다 (메트릭이 그것을 센다).
 */
function mergeOnce(
  x: number[][],
  member: number[],
  alive: number[],
  mode: number,
): HierarchicalMerge & { measured: number } {
  const n = member.length;
  let best = -1;
  let bi = -1;
  let bj = -1;
  let measured = 0;
  for (let i = 0; i < n; i++) {
    if (alive[i] === 1) {
      for (let j = i + 1; j < n; j++) {
        if (alive[j] === 1) {
          let acc = 0;
          let cnt = 0;
          for (let p = 0; p < n; p++) {
            if (member[p] === i) {
              for (let q = 0; q < n; q++) {
                if (member[q] === j) {
                  const dx = x[p][0] - x[q][0];
                  const dy = x[p][1] - x[q][1];
                  const d = Math.sqrt(dx * dx + dy * dy);
                  measured += 1;
                  // ── 세 연결 방식의 차이는 이 세 줄이다 (irs.ts 와 같다).
                  if (mode === 0 && (cnt === 0 || d < acc)) acc = d;
                  if (mode === 1 && (cnt === 0 || d > acc)) acc = d;
                  if (mode === 2) acc = acc + d;
                  cnt = cnt + 1;
                }
              }
            }
          }
          if (mode === 2) acc = acc / cnt;
          if (best < 0 || acc < best) {
            best = acc;
            bi = i;
            bj = j;
          }
        }
      }
    }
  }
  for (let p = 0; p < n; p++) {
    if (member[p] === bj) member[p] = bi;
  }
  alive[bj] = 0;
  return { into: bi, gone: bj, height: best, measured };
}

/**
 * 나무를 주어진 높이에서 자른 결과 — 각 점이 어느 무리의 대표에 속하는가.
 *
 * 병합 높이는 오름차순이므로 "그 높이 이하의 병합만 적용한다" 로 곧바로 나온다.
 */
export function groupsAtCut(
  n: number,
  merges: readonly HierarchicalMerge[],
  cutHeight: number,
): number[] {
  const member = Array.from({ length: n }, (_, i) => i);
  for (const m of merges) {
    if (m.height > cutHeight) continue;
    for (let p = 0; p < n; p++) {
      if (member[p] === m.gone) member[p] = m.into;
    }
  }
  return member;
}

/** 자른 높이에서의 무리 수. */
export function clusterCountAtCut(
  n: number,
  merges: readonly HierarchicalMerge[],
  cutHeight: number,
): number {
  let k = n;
  for (const m of merges) {
    if (m.height <= cutHeight) k -= 1;
  }
  return k;
}

/** 위젯 payload 에서 구간 번호만 꺼낸다. 모양이 다르면 null. */
function readSegment(payload: unknown, count: number): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const idx = p.segmentIndex;
  if (typeof idx !== 'number' || !Number.isInteger(idx)) return null;
  if (idx < 0 || idx >= count) return null;
  return idx;
}

function clampIndex(value: number | undefined, count: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  return Math.max(0, Math.min(count - 1, value));
}

export async function hierarchical(ctx: FacetContext<HierarchicalData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HierarchicalData>;
  const data = ctx.data;
  const n = data.points.length;
  const x = data.points.map((p) => [p.x, p.y]);
  const cutHeights = data.cutHeights;
  const stepMs = data.timings.mergeStepMs;

  let linkIndex = clampIndex(data.initialLinkIndex, LINK_COUNT);
  let cutIndex = clampIndex(data.initialCutIndex, cutHeights.length);
  let merges: HierarchicalMerge[] = [];
  /**
   * 배지에 지금 찍혀 있는 무리 수.
   *
   * `ctx.metric` 은 차분만 받고 메커니즘의 누적기는 0 에서 시작하므로, 여기도
   * 0 에서 시작해야 배지의 값과 어긋나지 않는다 (`facet.ts` 의 `initial: 8` 은
   * 첫 갱신 전까지 보이는 값이다 — 점 여덟이 각자 한 무리인 상태).
   */
  let shownClusters = 0;

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const showClusters = (k: number): void => {
    if (k === shownClusters) return;
    ctx.metric('cluster-count', k - shownClusters);
    shownClusters = k;
  };

  /**
   * 나무 하나를 짓는다. `animate` 면 걸음마다 쉬어 한 걸음씩 보인다.
   *
   * 손잡이를 옮겨 다시 지을 때는 쉬지 않는다 — 처음부터 재생하면 견주기가
   * 안 되기 때문이다 (지금 자리에서 값만 갈아 끼운다).
   */
  async function buildTree(
    mode: number,
    animate: boolean,
  ): Promise<{ list: HierarchicalMerge[]; distanceCount: number }> {
    const member = Array.from({ length: n }, (_, i) => i);
    const alive = Array.from({ length: n }, () => 1);
    const list: HierarchicalMerge[] = [];
    let distanceCount = 0;
    for (let step = 0; step < n - 1; step++) {
      // 손잡이로 다시 지을 때는 `animate` 가 꺼져 `sleep` 이 없다 — 그 경로에는
      // 취소를 볼 문이 하나도 없으므로 루프가 스스로 진다 (C8).
      if (ctx.cancelled) return { list, distanceCount };
      await phase('scan-pairs');
      const found = mergeOnce(x, member, alive, mode);
      distanceCount += found.measured;
      ctx.metric('distance-count', found.measured);
      await phase('point-pair');
      // phase 이름은 호출부에 리터럴로 나타나야 한다 (C3).
      if (mode === 0) await phase('link-single');
      if (mode === 1) await phase('link-complete');
      if (mode === 2) await phase('link-average');
      await phase('pick-closest');
      await phase('merge');
      await phase('report');

      list.push({ into: found.into, gone: found.gone, height: found.height });
      ctx.metric('merge-count', 'inc');
      const cut = cutHeights[cutIndex];
      showClusters(clusterCountAtCut(n, list, cut));
      await ctx.emit({
        type: 'merge-made',
        target: [`cluster:${found.into}`, `cluster:${found.gone}`],
        payload: {
          step,
          into: found.into,
          gone: found.gone,
          height: found.height,
          groups: groupsAtCut(n, list, cut),
          clusterCount: shownClusters,
        },
      });
      if (animate) {
        const ticked = await rctx.sleep(stepMs);
        if (!ticked) return { list, distanceCount };
      }
    }
    return { list, distanceCount };
  }

  /** 지금의 나무와 지금의 높이로 답을 낸다. 손잡이가 움직일 때마다 다시 부른다. */
  async function announce(distanceCount: number, treeChanged: boolean): Promise<void> {
    if (treeChanged) {
      await ctx.emit({
        type: 'tree-built',
        payload: { linkIndex, merges: merges.map((m) => ({ ...m })), distanceCount },
      });
    }
    const cut = cutHeights[cutIndex];
    const groups = groupsAtCut(n, merges, cut);
    const k = clusterCountAtCut(n, merges, cut);
    showClusters(k);
    await ctx.emit({
      type: 'cut-changed',
      payload: { cutIndex, cutHeight: cut, groups, clusterCount: k },
    });
    // 첫 점과 끝 점이 한 무리인가 — 다리를 타고 두 덩이가 이어 붙었다는 뜻이다.
    const chained = groups[0] === groups[n - 1];
    await ctx.emit({
      type: 'done',
      payload: {
        linkIndex,
        cutIndex,
        cutHeight: cut,
        clusterCount: k,
        chained,
        textKey: chained ? 'caption.chained' : 'caption.separate',
      },
    });
  }

  /** 지금 나무를 짓는 동안 잰 점쌍 거리의 수. `tree-built` 가 들고 나간다. */
  let lastDistanceCount = 0;

  try {
    const first = await buildTree(linkIndex, true);
    merges = first.list;
    lastDistanceCount = first.distanceCount;
    await announce(lastDistanceCount, true);

    for (;;) {
      if (ctx.cancelled) return;
      const input = await rctx.waitForInput<HierarchicalInputEvent>();
      if (ctx.cancelled) return;
      if (input.type === 'set-link') {
        const next = readSegment(input.payload, LINK_COUNT);
        if (next === null || next === linkIndex) continue;
        linkIndex = next;
        const rebuilt = await buildTree(linkIndex, false);
        merges = rebuilt.list;
        lastDistanceCount = rebuilt.distanceCount;
        await announce(lastDistanceCount, true);
      } else if (input.type === 'set-cut') {
        const next = readSegment(input.payload, cutHeights.length);
        if (next === null || next === cutIndex) continue;
        cutIndex = next;
        await announce(lastDistanceCount, false);
      }
      // 그 밖의 신호는 이 facet 의 어휘가 아니다 — 흘린다.
    }
  } catch (err) {
    // 되감기·파기는 `waitForInput` 을 reject 해 여기로 온다. 그 밖의 오류를
    // 함께 삼키면 화면이 까닭 없이 멎으므로 다시 던진다 (C8 gate).
    if (!ctx.cancelled) throw err;
  }
}
