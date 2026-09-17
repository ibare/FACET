/**
 * 이웃을 미리 이어 둔다 — 한 층에서 걸어 가장 가까운 점을 찾는다.
 *
 * 점마다 가장 가까운 몇을 이웃으로 들고 있으면, 전부 재지 않고도 답에 다다를 수
 * 있다. 선 자리의 이웃만 보고 질의에 더 가까운 쪽으로 발을 옮기다가, 나아질
 * 데가 없으면 멈춘다.
 *
 * ── 이벤트 목록 + payload 스키마 (C2)
 *
 *   graph-ready  {}
 *                미리 이어 둔 길을 놓고 첫 발을 올린다. 길도 출발점도 바탕에서
 *                나오므로 싣지 않는다 — 장면이 `nearestNeighbors` 를 불러 셈한다.
 *                silent 아님.
 *   probe        { best: number | null }
 *                선 자리의 이웃을 본다. best 는 질의에 더 가까운 이웃 중 가장
 *                가까운 것이고, 나아질 데가 없으면 null. **이 조각의 판정이라
 *                유일하게 싣는 것이다.** 선 자리도 이웃 목록도 자취와 바탕에서
 *                나온다. silent 아님.
 *   step-to      {}
 *                발을 옮긴다. 어디로 가는지는 바로 앞 probe 가 이미 말했다.
 *                silent 아님.
 *   settle       {}
 *                더 가까운 이웃이 없어 걸음이 멎었다. 선 자리는 자취의 끝이다.
 *                silent 아님.
 *   rewind       {}
 *                자동 재생이 끝난 뒤 한 걸음씩 다시 볼 때 처음으로 되감는다.
 *                silent 아님 — 화면이 실제로 처음 모습으로 돌아간다.
 *
 * ── 무엇을 싣고 무엇을 세는가
 *
 * **이웃 중에서 질의에 더 가까운 것을 고르는 셈이 이 조각의 알고리즘 그 자체**라
 * 그 판정(`probe.best`)만 싣는다. 반대로 **미리 이어 둔 길**은 이 조각이 말하는 바가
 * 아니라 그 앞의 전제다 — description 이 "이웃을 어떻게 골라 그래프를 짓는가" 를
 * 말하지 않는다고 못박고 있다. 그래서 `nearestNeighbors` 와 `undirectedLinks` 를
 * 내주어 장면이 바탕에서 곧바로 셈한다. 몇 번째 걸음인가도, 선 자리도, 이웃
 * 목록도 자취에서 나온다.
 *
 * 메트릭은 없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type NeighborsPoint = { x: number; y: number };

export type NeighborsLinkedAheadData = {
  type: 'neighbors-linked-ahead';
  /** 평면 위의 점들. 이웃 목록이 아니라 좌표가 1차 데이터다. */
  points: NeighborsPoint[];
  /** 찾아갈 자리. */
  query: NeighborsPoint;
  /** 점 하나가 들고 있는 이웃의 수. */
  neighborCount: number;
  /** 걸음을 시작하는 점의 번호. */
  start: number;
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 제곱 거리. 견주기만 할 것이라 뿌리를 뽑지 않는다. */
function dist2(a: NeighborsPoint, b: NeighborsPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * 점마다 가장 가까운 k 개.
 *
 * **좌표에서 셈한다.** 손으로 적은 목록을 두면 좌표를 고쳤을 때 그림이 거짓이
 * 된다. 거리가 같으면 번호가 낮은 쪽을 앞에 두어 어디서 돌려도 같은 순서가 나온다.
 */
export function nearestNeighbors(points: NeighborsPoint[], k: number): number[][] {
  return points.map((p, i) =>
    points
      .map((other, j) => ({ j, d: dist2(p, other) }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d || a.j - b.j)
      .slice(0, Math.max(0, k))
      .map((c) => c.j),
  );
}

/**
 * 무향 링크 한 벌. 낮은 번호를 앞에 두어 같은 변을 두 번 그리지 않는다.
 *
 * 내주는 까닭은 화면이 길을 그려야 하기 때문이다. 길을 발신에 실으면 같은 규칙이
 * 두 벌이 되고, 좌표를 고쳤을 때 한쪽만 따라온다.
 */
export function undirectedLinks(adjacency: number[][]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (let i = 0; i < adjacency.length; i += 1) {
    for (const j of adjacency[i]) {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a},${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
}

export async function neighborsLinkedAheadAlgorithm(
  base: FacetContext<NeighborsLinkedAheadData>,
): Promise<void> {
  const ctx = base as ReactiveContext<NeighborsLinkedAheadData>;
  const { points, query, neighborCount, start, stepMs } = ctx.data;

  // 길 자체는 발신에 싣지 않는다 — 장면이 같은 함수를 불러 바탕에서 셈한다.
  const adjacency = nearestNeighbors(points, neighborCount);

  /**
   * 한 바퀴 걷는다. manual 이면 걸음 사이마다 `advance` 를 기다린다.
   * 취소되었으면 false 를 돌려 위에서 그대로 손을 뗀다.
   */
  async function walk(manual: boolean): Promise<boolean> {
    let opened = false;

    /**
     * 걸음 사이의 문.
     *
     * 첫 걸음 앞에는 기다릴 앞걸음이 없으므로 그냥 지난다 — 문을 먼저 두면
     * 마운트 직후 빈 화면이 stepMs 만큼 보인다 (S-piece).
     */
    async function gate(): Promise<boolean> {
      if (!opened) {
        opened = true;
        return true;
      }
      if (!manual) return ctx.sleep(stepMs);
      for (;;) {
        if (ctx.cancelled) return false;
        let input: ReactiveInputEvent;
        try {
          input = await ctx.waitForInput();
        } catch (err) {
          // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
          // 올려 러너가 드러내게 둔다 (C8 정본).
          if (!ctx.cancelled) throw err;
          return false;
        }
        if (ctx.cancelled) return false;
        // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않게 (S-piece).
        if (input.type === 'advance') return true;
      }
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'graph-ready' });
    if (ctx.cancelled) return false;

    let at = start;
    for (;;) {
      const candidates = adjacency[at] ?? [];
      const here = points[at];
      if (here === undefined) return false;

      // 이웃 중 질의에 더 가까운 것을 고른다. 지금 자리보다 나아야 하므로 엄격하게 견준다.
      let best: number | null = null;
      let bestD = dist2(here, query);
      for (const c of candidates) {
        const other = points[c];
        if (other === undefined) continue;
        const d = dist2(other, query);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }

      if (!(await gate())) return false;
      await ctx.emit({ type: 'probe', payload: { best } });
      if (ctx.cancelled) return false;

      if (best === null) break;

      if (!(await gate())) return false;
      await ctx.emit({ type: 'step-to' });
      if (ctx.cancelled) return false;
      at = best;
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'settle' });
    return !ctx.cancelled;
  }

  // 마운트하면 스스로 한 바퀴 걷는다.
  if (!(await walk(false))) return;

  // 그 뒤로는 누를 때마다 되감고 한 걸음씩 — 곱씹으며 읽고 싶은 사람을 위한 것이다.
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!ctx.cancelled) throw err;
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    // 첫 누름은 되감고 첫 걸음까지 간다 — 되감기만 하면 반응이 없는 것으로 읽힌다.
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
    if (!(await walk(true))) return;
  }
}
