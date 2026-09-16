/**
 * bottleneckSetsFlow — 한 길로 흘릴 수 있는 양은 가장 좁은 곳이 정한다.
 *
 * 아직 여유가 남은 길을 찾고, 그 길에서 여유가 가장 적은 관을 짚고, 딱 그만큼만
 * 흘린다. 흘리고 나면 가장 좁았던 관이 꽉 차서 다음 길은 그 관을 지날 수 없다.
 *
 * ── 식별자
 *   node:<id>            정점 (S / A / B / T)
 *   edge:<from>-<to>     관 하나
 *
 * ── 이벤트 (`done` 만 표준 어휘, 나머지는 이 facet 고유)
 *
 *   rewind             {}                                               silent: false
 *     되감았다. 한 걸음씩 다시 볼 때 맨 앞에 한 번.
 *
 *   path-found         { edges: string[] }                              silent: false
 *     여유가 남은 길을 찾았다. edges 는 들어오는 곳에서 나가는 곳 순서의 관들.
 *     지나는 정점 차례는 그 관들에서 펴지므로 싣지 않는다.
 *     target: 그 관들의 `edge:` 식별자 배열.
 *
 *   narrowest-marked   { narrowest: string[] }                          silent: false
 *     그 길에서 남은 여유가 가장 적은 관을 짚는다. 여유가 같은 관이 여럿이면
 *     narrowest 도 여럿이다. **흘릴 양은 싣지 않는다** — 그 관의 여유를 읽으면
 *     나오고, 여유는 용량에서 흘린 양을 빼 구조에서 세진다.
 *     target: narrowest 의 `edge:` 식별자 배열.
 *
 *   flow-pushed        {}                                               silent: false
 *     짚어 둔 만큼 흘렸다. 갱신된 유량도 꽉 찬 관도 도착 총량도 싣지 않는다 —
 *     길과 흘릴 양에서 전부 파생된다. target: 그 길의 `edge:` 식별자 배열.
 *
 *   no-more-room       {}                                               silent: false
 *     들어오는 곳에서 나가는 관이 모두 꽉 차 더 갈 길이 없다. 그 관들은 선언에서
 *     골라지므로 싣지 않는다. target: 그 관들의 `edge:` 식별자 배열.
 *
 *   done               {}                                               silent: false
 *     끝. 흘려보낸 총량은 지나온 걸음의 합이라 싣지 않는다.
 *
 * ── 메커니즘
 * reactive. mount 하면 스스로 자동 재생하고, 끝난 뒤에는 `advance` 입력마다 한
 * 걸음씩 다시 밟는다. 자동 재생 뒤 처음 누르는 `advance` 는 되감고 첫 걸음까지
 * 간다 (S-piece).
 *
 * 메트릭 없음 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type FlowPipe = {
  /** `<from>-<to>`. `edge:` prefix 를 붙여 target 으로 쓴다. */
  id: string;
  from: string;
  to: string;
  /** 관의 굵기. 이 관으로 흘릴 수 있는 최대량. */
  capacity: number;
};

export type BottleneckSetsFlowData = {
  type: 'bottleneck-sets-flow';
  nodes: string[];
  edges: FlowPipe[];
  /** 들어오는 곳. */
  source: string;
  /** 나가는 곳. */
  sink: string;
  /** 걸음 간격 (ms). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 900;

/**
 * 여유가 남은 관만 밟아 들어오는 곳에서 나가는 곳까지 가는 길을 찾는다.
 * 너비 우선이라 관을 적게 지나는 길이 먼저 나온다. 없으면 null.
 *
 * 돌려주는 것은 관의 차례뿐이다 — 지나는 정점은 그 관들에서 펴진다.
 */
function findRoute(data: BottleneckSetsFlowData, flow: Map<string, number>): string[] | null {
  const from = new Map<string, { node: string; edge: string }>();
  const seen = new Set<string>([data.source]);
  const queue: string[] = [data.source];

  while (queue.length > 0) {
    const at = queue.shift();
    if (at === undefined) break;
    for (const pipe of data.edges) {
      if (pipe.from !== at) continue;
      if (pipe.capacity - (flow.get(pipe.id) ?? 0) <= 0) continue;
      if (seen.has(pipe.to)) continue;
      seen.add(pipe.to);
      from.set(pipe.to, { node: at, edge: pipe.id });
      if (pipe.to !== data.sink) {
        queue.push(pipe.to);
        continue;
      }
      // 나가는 곳에 닿았다 — 거슬러 올라가 길을 편다.
      const edges: string[] = [];
      let cursor = data.sink;
      let step = from.get(cursor);
      while (step !== undefined) {
        edges.unshift(step.edge);
        cursor = step.node;
        step = from.get(cursor);
      }
      return edges;
    }
  }
  return null;
}

/**
 * 한 바퀴를 처음부터 끝까지 재생한다.
 *
 * `manual` 이면 걸음마다 `advance` 를 기다린다. 되감기 직후 첫 문만 그냥 통과시켜
 * 첫 누름이 되감기로만 끝나지 않게 한다 (S-piece).
 */
async function playThrough(ctx: ReactiveContext<BottleneckSetsFlowData>, manual: boolean): Promise<void> {
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : FALLBACK_STEP_MS;
  const capacityOf = new Map(data.edges.map((pipe) => [pipe.id, pipe.capacity]));

  let firstGateOpen = manual;

  /** 다음 걸음까지 기다린다. 취소되었으면 false. */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return await ctx.sleep(stepMs);
    if (firstGateOpen) {
      firstGateOpen = false;
      return true;
    }
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch {
        // 기다리는 중에 러너가 접었다 (reset / destroy 가 waitForInput 을 reject 한다).
        return false;
      }
      // 걸음으로 세는 것은 advance 뿐이다. 다른 dispatch 는 흘려보낸다.
      if (input.type === 'advance') return true;
    }
  };

  if (manual) await ctx.emit({ type: 'rewind' });

  const flow = new Map<string, number>();

  for (;;) {
    const route = findRoute(data, flow);
    if (route === null) break;
    const marks = route.map((id) => `edge:${id}`);

    if (!(await gate())) return;
    await ctx.emit({ type: 'path-found', target: marks, payload: { edges: route } });

    const rooms = route.map((id) => (capacityOf.get(id) ?? 0) - (flow.get(id) ?? 0));
    const amount = Math.min(...rooms);
    const narrowest = route.filter((_, i) => rooms[i] === amount);

    if (!(await gate())) return;
    await ctx.emit({
      type: 'narrowest-marked',
      target: narrowest.map((id) => `edge:${id}`),
      payload: { narrowest },
    });

    for (const id of route) flow.set(id, (flow.get(id) ?? 0) + amount);

    if (!(await gate())) return;
    await ctx.emit({ type: 'flow-pushed', target: marks, payload: {} });
  }

  const blocked = data.edges.filter((pipe) => pipe.from === data.source).map((pipe) => pipe.id);

  if (!(await gate())) return;
  await ctx.emit({
    type: 'no-more-room',
    target: blocked.map((id) => `edge:${id}`),
    payload: {},
  });

  if (!(await gate())) return;
  await ctx.emit({ type: 'done', payload: {} });
}

export const bottleneckSetsFlowAlgorithm = async (
  ctx: FacetContext<BottleneckSetsFlowData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<BottleneckSetsFlowData>;

  await playThrough(rc, false);

  for (;;) {
    if (rc.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch {
      // 기다리는 중에 러너가 접었다 (reset / destroy).
      return;
    }
    if (input.type !== 'advance') continue;
    await playThrough(rc, true);
  }
};
