/**
 * undo-by-back-edge — 되돌리는 폭 (잔여 그래프의 역방향).
 *
 * 흘린 만큼 반대 방향으로 되돌릴 폭이 생긴다. 그래서 잘못 흘려도 고칠 수 있다.
 * 앞으로 난 화살만 타면 넷에서 막히고, 앞서 흘려 둔 것을 그 관에서 밀어내면
 * 여섯까지 간다 — 그 순서가 이 조각의 논증이다.
 *
 * 걸음표를 손으로 적지 않는다. 길 찾기는 간선 선언 순서대로 도는 DFS 이고,
 * 몇 바퀴를 돌지·어디서 막힐지·되돌릴 폭이 얼마인지는 전부 구조에서 셈한다.
 *
 * ── 식별자
 *   node:<id>            정점
 *   edge:<from>-<to>     방향 간선 (관)
 *
 * ── 이벤트 (`done` 만 표준이고 나머지 넷은 이 facet 고유.
 *            silent 는 없다 — 다섯 다 화면이 바뀐다)
 *
 *   path-found
 *     target  ['node:S','node:A',…]  길을 이루는 정점 차례
 *     payload { reverse: boolean[]    걸음마다 역방향 화살을 탔는지 (길이 = 정점수-1)
 *               amount: number        이 길로 보낼 수 있는 양 (가장 좁은 목)
 *               round: number         몇 번째 길인지 (1부터)
 *               usesReverse: boolean } 되돌릴 폭을 탔는지
 *
 *   flow-pushed
 *     target  path-found 와 같은 정점 차례
 *     payload { reverse: boolean[]; amount: number; round: number; usesReverse: boolean;
 *               total: number         T 에 닿은 누적량
 *               edges: string[]       모든 간선의 target 문자열
 *               flows: number[] }     edges 와 같은 차례의 흐른 양 (갱신 후)
 *
 *   search-blocked
 *     target  앞으로 난 화살만으로 닿는 정점들 ['node:S','node:B']
 *     payload { blocked: string[]     그 경계에서 꽉 찬 간선의 target 문자열
 *               total: number }       그때까지 T 에 닿은 양
 *
 *   done
 *     target  마지막으로 닿는 정점들
 *     payload { blocked: string[]; total: number }  (search-blocked 와 같은 모양)
 *
 *   rewind
 *     target  없음. payload 없음. 자동 재생을 마친 뒤 advance 로 되감을 때.
 *
 * ── 메트릭
 *   없다 (조각이므로 ctx.metric 을 부르지 않는다).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 관 하나 — 방향과 굵기(용량). */
export type UndoByBackEdgeEdge = {
  from: string;
  to: string;
  capacity: number;
};

export type UndoByBackEdgeData = {
  type: 'undo-by-back-edge';
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정이라 선언에 둔다. */
  stepMs: number;
  /** 들어오는 곳. */
  source: string;
  /** 나가는 곳. */
  sink: string;
  nodes: string[];
  edges: UndoByBackEdgeEdge[];
};

/** 한 바퀴에 찾은 길. `steps` 는 간선 번호라 흐름을 갱신할 때 쓴다. */
type Augmenting = {
  nodes: string[];
  reverse: boolean[];
  amount: number;
  steps: { edge: number; reverse: boolean }[];
};

const edgeTarget = (e: UndoByBackEdgeEdge): string => `edge:${e.from}-${e.to}`;
const nodeTargets = (ids: string[]): string[] => ids.map((id) => `node:${id}`);

/**
 * 늘릴 길 하나를 찾는다. 간선 선언 순서대로 도는 DFS 이며, 한 정점에서 앞으로 난
 * 화살을 먼저 다 보고 나서 역방향을 본다 — 되돌리는 것은 앞이 막혔을 때의 수단이다.
 *
 * @param allowReverse false 면 앞으로 난 화살만 탄다.
 */
function findAugmentingPath(
  data: UndoByBackEdgeData,
  flow: number[],
  allowReverse: boolean,
): Augmenting | null {
  const visited = new Set<string>();
  const order: string[] = [data.source];
  const steps: { edge: number; reverse: boolean }[] = [];

  const walk = (u: string): boolean => {
    if (u === data.sink) return true;
    visited.add(u);
    for (let i = 0; i < data.edges.length; i += 1) {
      const e = data.edges[i];
      if (e.from !== u || visited.has(e.to)) continue;
      if (e.capacity - flow[i] <= 0) continue;
      order.push(e.to);
      steps.push({ edge: i, reverse: false });
      if (walk(e.to)) return true;
      order.pop();
      steps.pop();
    }
    if (allowReverse) {
      for (let i = 0; i < data.edges.length; i += 1) {
        const e = data.edges[i];
        if (e.to !== u || visited.has(e.from)) continue;
        if (flow[i] <= 0) continue;
        order.push(e.from);
        steps.push({ edge: i, reverse: true });
        if (walk(e.from)) return true;
        order.pop();
        steps.pop();
      }
    }
    return false;
  };

  if (!walk(data.source)) return null;

  let amount = Number.POSITIVE_INFINITY;
  for (const s of steps) {
    const room = s.reverse ? flow[s.edge] : data.edges[s.edge].capacity - flow[s.edge];
    if (room < amount) amount = room;
  }
  return {
    nodes: [...order],
    reverse: steps.map((s) => s.reverse),
    amount,
    steps: [...steps],
  };
}

/** 앞으로 난 화살만 타고 들어오는 곳에서 닿을 수 있는 정점들 (닿은 차례대로). */
function forwardReachable(data: UndoByBackEdgeData, flow: number[]): string[] {
  const seen = new Set<string>([data.source]);
  const reached = [data.source];
  const stack = [data.source];
  while (stack.length > 0) {
    const u = stack.shift() as string;
    for (let i = 0; i < data.edges.length; i += 1) {
      const e = data.edges[i];
      if (e.from !== u || seen.has(e.to)) continue;
      if (e.capacity - flow[i] <= 0) continue;
      seen.add(e.to);
      reached.push(e.to);
      stack.push(e.to);
    }
  }
  return reached;
}

/** 닿은 곳에서 못 닿은 곳으로 나가는데 꽉 차 버린 관들 — 앞을 막고 있는 것. */
function saturatedFrontier(
  data: UndoByBackEdgeData,
  flow: number[],
  reachable: string[],
): string[] {
  const inside = new Set(reachable);
  const blocked: string[] = [];
  for (let i = 0; i < data.edges.length; i += 1) {
    const e = data.edges[i];
    if (!inside.has(e.from) || inside.has(e.to)) continue;
    if (e.capacity - flow[i] > 0) continue;
    blocked.push(edgeTarget(e));
  }
  return blocked;
}

/**
 * 한 판을 처음부터 끝까지 발신한다. 자동 재생과 한 걸음씩 보기가 같은 함수를
 * 쓰고, 다른 것은 걸음 사이의 문(gate) 뿐이다.
 *
 * @param gate 다음 걸음으로 넘어갈 때까지 기다린다. false 면 접힌 것이라 멈춘다.
 */
async function playTrace(
  ctx: ReactiveContext<UndoByBackEdgeData>,
  gate: () => Promise<boolean>,
): Promise<void> {
  const data = ctx.data;
  const flow = data.edges.map(() => 0);
  const allEdges = data.edges.map(edgeTarget);
  let total = 0;
  let round = 0;

  const sendAlong = async (path: Augmenting): Promise<boolean> => {
    round += 1;
    const usesReverse = path.reverse.includes(true);
    const targets = nodeTargets(path.nodes);

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'path-found',
      target: targets,
      payload: { reverse: path.reverse, amount: path.amount, round, usesReverse },
    });

    for (const s of path.steps) {
      flow[s.edge] += s.reverse ? -path.amount : path.amount;
    }
    total += path.amount;

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'flow-pushed',
      target: targets,
      payload: {
        reverse: path.reverse,
        amount: path.amount,
        round,
        usesReverse,
        total,
        edges: allEdges,
        flows: [...flow],
      },
    });
    return true;
  };

  for (;;) {
    if (ctx.cancelled) return;

    const forward = findAugmentingPath(data, flow, false);
    if (forward) {
      if (!(await sendAlong(forward))) return;
      continue;
    }

    // 앞으로 난 화살로는 더 갈 데가 없다. 어디까지 닿았고 무엇이 막고 있는지 보인다.
    const reachable = forwardReachable(data, flow);
    const blocked = saturatedFrontier(data, flow, reachable);
    const withReverse = findAugmentingPath(data, flow, true);

    if (!withReverse) {
      if (!(await gate())) return;
      await ctx.emit({
        type: 'done',
        target: nodeTargets(reachable),
        payload: { blocked, total },
      });
      return;
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'search-blocked',
      target: nodeTargets(reachable),
      payload: { blocked, total },
    });
    if (!(await sendAlong(withReverse))) return;
  }
}

export const undoByBackEdgeAlgorithm = async (
  ctx: FacetContext<UndoByBackEdgeData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<UndoByBackEdgeData>;
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : 950;

  /** advance 한 번을 기다린다. 다른 종류의 입력은 걸음으로 세지 않는다. */
  const waitAdvance = async (): Promise<boolean> => {
    for (;;) {
      if (rc.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await rc.waitForInput();
      } catch {
        // 기다리는 중에 러너가 세션을 접었다 (reset / destroy). 다음 재생이 새로 시작한다.
        return false;
      }
      if (rc.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  };

  let stepped = false;
  // 되감기 직후의 첫 문은 그냥 통과시킨다 — 처음 누른 advance 가 되감기만 하고
  // 멈추면 눌러도 반응이 없는 것으로 읽힌다.
  let passFirstGate = false;

  const gate = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    if (!stepped) return await rc.sleep(stepMs);
    if (passFirstGate) {
      passFirstGate = false;
      return true;
    }
    return await waitAdvance();
  };

  await playTrace(rc, gate);

  for (;;) {
    if (!(await waitAdvance())) return;
    stepped = true;
    passFirstGate = true;
    await rc.emit({ type: 'rewind' });
    await playTrace(rc, gate);
  }
};
