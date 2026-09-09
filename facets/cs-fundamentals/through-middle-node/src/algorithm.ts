/**
 * through-middle-node — 가운데를 거치면 짧아지는가 (플로이드-워셜의 물음).
 *
 * 두 점 사이의 길을 고칠 때 묻는 것은 하나다. 가운데에 한 점을 세워 두고
 * `from → 가운데 → to` 가 지금 아는 `from → to` 보다 짧은지 묻는다. 그 물음을
 * 가운데 후보마다, 그 안에서 모든 (from, to) 짝마다 되풀이한다 — 세 겹 반복문이
 * 여기서 나온다. 이 조각의 주장은 **묻는 자리가 아주 많고 그중 몇 번만 답이
 * "그렇다"** 라는 것이므로, 답이 "아니다" 인 물음도 빠짐없이 발신한다.
 *
 * ── 이벤트 (표준은 `done` 하나뿐이고 나머지는 이 facet 고유 어휘다. C2)
 *
 *   roads-ready  { edgeCount: number; middles: string[]; pairCount: number }
 *                주어진 길을 다 그렸다. `pairCount` 는 가운데 하나당 묻게 될
 *                짝의 수 = (n-1)(n-2). 화면의 물음 장부가 이 크기로 짜인다.
 *                silent 아님.
 *
 *   middle-set   { middle: string; order: number; total: number }
 *                가운데에 세울 정점이 바뀐다. silent 아님.
 *
 *   ask          { from: string; to: string; middle: string;
 *                  middleIndex: number; pairIndex: number;
 *                  legA: number | null; legB: number | null;
 *                  sum: number | null; current: number | null;
 *                  shorter: boolean }
 *                물음 하나. `legA` 는 from→가운데, `legB` 는 가운데→to,
 *                `sum` 은 둘의 합, `current` 는 지금 아는 from→to 다. 길이 없는
 *                자리는 `null` (화면에서 ∞). `shorter` 가 참이면 이 걸음에서
 *                from→to 가 `sum` 으로 고쳐진다. silent 아님.
 *
 *   rewind       {}
 *                한 걸음 보기로 들어가며 처음으로 되감는다. silent 아님.
 *
 *   done         { asked: number; improved: number }
 *                쓸어보기가 끝났다. 두 수 모두 이 실행에서 센 값이다. silent 아님.
 *
 * ── 걸음 간격
 *
 * `initialData.stepMs` 가 한 걸음의 기준이다. 다만 스물넷을 같은 간격으로 짚으면
 * 헛물켜는 쪽이 지루해지기만 한다. 그래서 **길이 끊겨** 재 볼 것도 없던 물음은
 * 기준의 8분의 1로 지나가고, 길이 고쳐지는 순간 · 가운데를 바꾸는 대목 · **재
 * 보았으나 더 멀던 물음**에만 머무른다. 셋째가 이 조각의 물음을 "길이 있는가" 가
 * 아니라 "짧아지는가" 로 만드는 자리라 짧게 지나가면 안 된다. 걸음마다 stage 의
 * 움직임이 그 위에 더해진다 (S-piece). 읽을 시간을 어디에 쓸지가 저작 결정이라
 * 기준값은 선언에 있다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ThroughMiddleNodeEdge = {
  from: string;
  to: string;
  weight: number;
};

export type ThroughMiddleNodeData = {
  type: 'through-middle-node';
  /** 정점 이름. 화면의 배치는 view 가 간선을 보고 정한다. */
  nodes: string[];
  /** 방향 간선. 같은 짝이 둘이면 작은 무게가 이긴다. */
  edges: ThroughMiddleNodeEdge[];
  /** 한 걸음의 기준 간격 (ms). */
  stepMs: number;
};

/** 거리표의 열쇠. `from>to` — 방향이 있으므로 뒤집으면 다른 자리다. */
function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/** 주어진 간선만으로 만든 첫 거리표. 없는 짝은 열쇠 자체가 없다 (= ∞). */
function initialDistances(edges: ThroughMiddleNodeEdge[]): Map<string, number> {
  const dist = new Map<string, number>();
  for (const edge of edges) {
    const key = pairKey(edge.from, edge.to);
    const known = dist.get(key);
    if (known === undefined || edge.weight < known) dist.set(key, edge.weight);
  }
  return dist;
}

/** ∞ 를 JSON 으로 실어 나를 수 없으므로 없는 값은 null 로 보낸다. */
function orNull(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

export const throughMiddleNodeAlgorithm = async (
  base: FacetContext<ThroughMiddleNodeData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<ThroughMiddleNodeData>;
  const data = ctx.data;

  const step = Math.max(120, data.stepMs);
  /** 주어진 길을 훑어볼 시간. */
  const holdOpen = Math.round(step * 0.7);
  /** 가운데를 바꾸는 대목 — 다음 여섯 물음이 누구를 거치는지 읽고 넘어간다. */
  const holdBeat = Math.round(step * 0.4);
  /** 길이 끊겨 재 볼 것도 없던 물음. 머무르지 않고 지나가야 "많다" 가 리듬으로 남는다. */
  const holdQuick = Math.round(step * 0.12);
  /** 길은 다 있어 재 보았으나 더 멀던 물음. 이 조각이 묻는 물음이 여기서 참말이 된다. */
  const holdWeigh = Math.round(step * 0.45);
  /** 길이 고쳐지는 순간. 여기만 온전히 머문다. */
  const holdFix = Math.round(step * 0.5);

  /** 자동 재생이 끝난 뒤에는 `advance` 한 번이 한 걸음이 된다. */
  let byHand = false;

  /**
   * 한 걸음 머무른다. 자동 재생이면 자고, 한 걸음 보기면 `advance` 를 기다린다.
   * 러너가 접었으면 false — 부른 쪽은 즉시 되돌아간다.
   */
  async function hold(ms: number): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!byHand) return ctx.sleep(ms);
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch {
        // 기다리는 중에 러너가 접었다 (reset / destroy). 되돌아가는 것이 정상 종료다.
        return false;
      }
      // 위젯 입력이 붙으면 아무 dispatch 나 걸음으로 세게 되므로 종류를 본다.
      if (input.type === 'advance') return true;
    }
  }

  /**
   * 처음부터 끝까지 한 바퀴.
   *
   * 발신이 먼저고 머무름이 나중이라, 한 걸음 보기로 들어간 직후에는 되감기와
   * 첫 걸음이 잇달아 나온다 — 눌렀는데 아무 일도 없는 것으로 읽히지 않게 (S-piece).
   */
  async function sweep(): Promise<void> {
    const dist = initialDistances(data.edges);
    const nodeCount = data.nodes.length;
    const pairCount = Math.max(0, (nodeCount - 1) * (nodeCount - 2));
    let asked = 0;
    let improved = 0;

    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'roads-ready',
      payload: {
        edgeCount: data.edges.length,
        middles: [...data.nodes],
        pairCount,
      },
    });
    if (!(await hold(holdOpen))) return;

    // 가운데로 세워 볼 차례는 정점 목록 그대로다. 따로 적어 두면 한쪽만 고쳐도
    // 조용히 어긋난다 — 표에는 없는 정점이 열로 서거나 그 반대가 된다.
    for (let middleIndex = 0; middleIndex < data.nodes.length; middleIndex += 1) {
      if (ctx.cancelled) return;
      const middle = data.nodes[middleIndex];
      if (middle === undefined) continue;

      await ctx.emit({
        type: 'middle-set',
        payload: { middle, order: middleIndex, total: data.nodes.length },
      });
      if (!(await hold(holdBeat))) return;

      let pairIndex = 0;
      for (const from of data.nodes) {
        if (ctx.cancelled) return;
        if (from === middle) continue;
        for (const to of data.nodes) {
          if (ctx.cancelled) return;
          if (to === middle || to === from) continue;

          const legA = dist.get(pairKey(from, middle));
          const legB = dist.get(pairKey(middle, to));
          const current = dist.get(pairKey(from, to));
          const sum = legA !== undefined && legB !== undefined ? legA + legB : undefined;
          const shorter = sum !== undefined && (current === undefined || sum < current);

          if (shorter && sum !== undefined) dist.set(pairKey(from, to), sum);
          asked += 1;
          if (shorter) improved += 1;

          await ctx.emit({
            type: 'ask',
            payload: {
              from,
              to,
              middle,
              middleIndex,
              pairIndex,
              legA: orNull(legA),
              legB: orNull(legB),
              sum: orNull(sum),
              current: orNull(current),
              shorter,
            },
          });
          pairIndex += 1;
          const weighed = legA !== undefined && legB !== undefined;
          if (!(await hold(shorter ? holdFix : weighed ? holdWeigh : holdQuick))) return;
        }
      }
    }

    if (ctx.cancelled) return;
    // 마지막 걸음은 머무르지 않는다 — 머물면 한 걸음 보기에서 한 번 더 눌러야
    // 바퀴가 닫힌다.
    await ctx.emit({ type: 'done', payload: { asked, improved } });
  }

  await sweep();

  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch {
      // 기다리는 중에 러너가 접었다 (reset / destroy).
      return;
    }
    if (input.type !== 'advance') continue;
    byHand = true;
    await ctx.emit({ type: 'rewind' });
    await sweep();
    byHand = false;
  }
};
