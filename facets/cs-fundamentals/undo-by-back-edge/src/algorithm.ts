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
 *     payload { reverse: boolean[] }  걸음마다 역방향 화살을 탔는지 (길이 = 정점수-1)
 *
 *     이 발신만이 길을 싣는다. **어느 길을 찾았나는 이 조각의 알고리즘이 내리는
 *     판정**이라 장면이 되풀이할 수 없다. 그 밖의 것 — 가장 좁은 목이 얼마인지,
 *     몇 번째 길인지, 되돌릴 폭을 탔는지 — 은 길과 흐름표에서 전부 나오므로
 *     싣지 않는다 (`scene.ts` 의 `bottleneck` · `usesReverse`).
 *
 *   flow-pushed
 *     target  없음. payload 없음. 방금 찾은 길로 흘린다는 것이 전부다.
 *
 *     흐름표도 누적량도 싣지 않는다. 장면이 제 흐름표에 그 길과 그 폭을 더하면
 *     같은 값이 나오고, 두 자리에서 세지 않으므로 갈릴 자리가 없다.
 *
 *   search-blocked
 *     target  없음. payload 없음.
 *
 *     앞으로 난 화살로는 더 갈 데가 없다는 **판정**만 보낸다. 어디까지 닿았고
 *     무엇이 막고 있는지는 장면이 제 흐름표에서 셈한다 (`forwardReachable` ·
 *     `saturatedFrontier`) — 멈춤의 근거가 화면의 자취와 같은 자료여야 한다.
 *
 *   done
 *     target  없음. payload 없음. 되돌릴 폭으로도 남은 길이 없다.
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

  /** 길 하나를 보이고 그 길로 흘린다. 두 걸음이다 — 찾는 것과 흘리는 것. */
  const sendAlong = async (path: Augmenting): Promise<boolean> => {
    if (!(await gate())) return false;
    await ctx.emit({
      type: 'path-found',
      target: nodeTargets(path.nodes),
      payload: { reverse: path.reverse },
    });

    for (const s of path.steps) {
      flow[s.edge] += s.reverse ? -path.amount : path.amount;
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'flow-pushed' });
    return true;
  };

  for (;;) {
    if (ctx.cancelled) return;

    const forward = findAugmentingPath(data, flow, false);
    if (forward) {
      if (!(await sendAlong(forward))) return;
      continue;
    }

    // 앞으로 난 화살로는 더 갈 데가 없다. 어디까지 닿았고 무엇이 막고 있는지는
    // 장면이 제 흐름표에서 셈하므로 여기서는 판정만 보낸다.
    const withReverse = findAugmentingPath(data, flow, true);

    if (!withReverse) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'done' });
      return;
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'search-blocked' });
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
