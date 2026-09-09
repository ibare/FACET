/**
 * sortEdgesAvoidCycle — 무게 순으로 줄 세운 간선을 위에서부터 집되,
 * 고리가 되는 것은 버린다 (크루스칼의 채택/기각 판정).
 *
 * 조각(piece) facet. 답하는 질문 하나: **왜 어떤 간선은 버려지는가.**
 * 버리는 근거는 "집어 든 간선의 양 끝이 이미 같은 무리인가" 이므로,
 * 무리가 간선을 놓을 때마다 합쳐지는 것과 이미 이어져 있던 경로가
 * 화면에 함께 나와야 한다.
 *
 * ── 식별자
 *   edge:<u>-<v>   간선 (무방향, id 는 initialData 의 edges[].id)
 *
 * ── 이벤트 (전부 facet 고유 확장. 표준 어휘는 done 뿐)
 *
 *  queue-ordered   무게 오름차순으로 줄이 선다. 재생 시작 시 한 번.
 *    payload { order: { id: string; u: string; v: string; weight: number }[] }
 *    silent: 아니다 (줄이 실제로 재배열된다)
 *
 *  edge-picked     줄 맨 위 간선을 집어 그래프의 제 자리로 옮긴다.
 *    target  'edge:<id>'
 *    payload { id: string; u: string; v: string; weight: number }
 *    silent: 아니다
 *
 *  edge-kept       양 끝이 서로 다른 무리라 간선을 놓는다. 두 무리가 하나가 된다.
 *    target  'edge:<id>'
 *    payload { id: string; u: string; v: string; weight: number;
 *              groupId: string; members: string[] }
 *      groupId 합쳐진 뒤 무리의 대표 정점, members 그 무리에 속한 모든 정점
 *    silent: 아니다
 *
 *  edge-discarded  양 끝이 이미 같은 무리라 버린다.
 *    target  'edge:<id>'
 *    payload { id: string; u: string; v: string; weight: number;
 *              groupId: string; cyclePath: string[] }
 *      cyclePath 이미 놓인 간선만 밟아 u 에서 v 로 가는 경로 (양 끝 포함).
 *                집어 든 간선을 보태면 닫히는 고리 그 자체다.
 *    silent: 아니다
 *
 *  rewind          자동 재생을 마친 뒤 처음으로 되돌린다. payload 없음.
 *    silent: 아니다
 *
 *  done            재생 종료. 파생값은 전부 여기서 셈한 것이다.
 *    payload { kept: number; discarded: number; totalWeight: number }
 *    silent: 아니다
 *
 * ── 메트릭
 *   없다. 조각은 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SortEdgesAvoidCycleEdge = {
  id: string;
  u: string;
  v: string;
  weight: number;
};

export type SortEdgesAvoidCycleData = {
  type: 'sort-edges-avoid-cycle';
  nodes: string[];
  edges: SortEdgesAvoidCycleEdge[];
  /** 걸음 간격(ms). 읽을 시간을 주는 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 800;

/** 이미 놓인 간선만 밟아 from → to 경로를 찾는다. 없으면 빈 배열. */
function pathThroughKept(
  from: string,
  to: string,
  kept: SortEdgesAvoidCycleEdge[],
): string[] {
  const adjacency = new Map<string, string[]>();
  for (const e of kept) {
    const a = adjacency.get(e.u) ?? [];
    a.push(e.v);
    adjacency.set(e.u, a);
    const b = adjacency.get(e.v) ?? [];
    b.push(e.u);
    adjacency.set(e.v, b);
  }
  const previous = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === to) break;
    for (const next of adjacency.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, cur);
      queue.push(next);
    }
  }
  if (!seen.has(to)) return [];
  const path: string[] = [to];
  let cursor = to;
  while (cursor !== from) {
    const p = previous.get(cursor);
    if (p === undefined) return [];
    path.push(p);
    cursor = p;
  }
  return path.reverse();
}

export const sortEdgesAvoidCycleAlgorithm = async (
  baseCtx: FacetContext<SortEdgesAvoidCycleData>,
): Promise<void> => {
  const ctx = baseCtx as ReactiveContext<SortEdgesAvoidCycleData>;
  const stepMs =
    typeof ctx.data.stepMs === 'number' && ctx.data.stepMs > 0
      ? ctx.data.stepMs
      : DEFAULT_STEP_MS;

  // 자동 재생 한 바퀴가 끝나면 manual 로 넘어가 advance 를 한 걸음으로 받는다.
  let manual = false;
  // 되감기 직후의 첫 문은 그냥 통과시킨다 — 처음 누른 advance 가 되감기만 하고
  // 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  let skipNextGate = false;

  /** 걸음 사이의 문. emit 앞에 둔다. false 면 러너가 접었다는 뜻. */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (skipNextGate) {
      skipNextGate = false;
      return true;
    }
    for (;;) {
      // 기다리는 중에 러너가 접으면 waitForInput 이 reject 한다 (reset / destroy).
      // 그것은 오류가 아니라 종료 신호라 null 로 받아 걸음을 끝낸다.
      const input = await ctx.waitForInput().catch(() => null);
      if (input === null) return false;
      // 지금은 advance 만 들어오지만, 위젯 입력이 붙으면 아무 dispatch 나
      // 걸음으로 세게 되므로 종류를 본다.
      if (input.type === 'advance') return true;
    }
  };

  const playOnce = async (): Promise<boolean> => {
    const order = [...ctx.data.edges].sort((a, b) => a.weight - b.weight);

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'queue-ordered',
      payload: {
        order: order.map((e) => ({ id: e.id, u: e.u, v: e.v, weight: e.weight })),
      },
    });

    // 무리 = union-find. 대표는 큰 쪽이 이기고, 크기가 같으면 먼저 온 쪽이 이긴다.
    const parent = new Map<string, string>();
    const size = new Map<string, number>();
    for (const n of ctx.data.nodes) {
      parent.set(n, n);
      size.set(n, 1);
    }
    const find = (n: string): string => {
      let cur = n;
      for (;;) {
        const p = parent.get(cur);
        if (p === undefined || p === cur) return cur;
        cur = p;
      }
    };

    const kept: SortEdgesAvoidCycleEdge[] = [];
    let discarded = 0;
    let totalWeight = 0;

    for (const edge of order) {
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'edge-picked',
        target: `edge:${edge.id}`,
        payload: { id: edge.id, u: edge.u, v: edge.v, weight: edge.weight },
      });

      const ru = find(edge.u);
      const rv = find(edge.v);

      if (!(await gate())) return false;
      if (ru === rv) {
        const cyclePath = pathThroughKept(edge.u, edge.v, kept);
        discarded += 1;
        await ctx.emit({
          type: 'edge-discarded',
          target: `edge:${edge.id}`,
          payload: {
            id: edge.id,
            u: edge.u,
            v: edge.v,
            weight: edge.weight,
            groupId: ru,
            cyclePath,
          },
        });
        continue;
      }

      const su = size.get(ru) ?? 1;
      const sv = size.get(rv) ?? 1;
      const winner = sv > su ? rv : ru;
      const loser = winner === ru ? rv : ru;
      parent.set(loser, winner);
      size.set(winner, su + sv);
      kept.push(edge);
      totalWeight += edge.weight;
      const members = ctx.data.nodes.filter((n) => find(n) === winner);
      await ctx.emit({
        type: 'edge-kept',
        target: `edge:${edge.id}`,
        payload: {
          id: edge.id,
          u: edge.u,
          v: edge.v,
          weight: edge.weight,
          groupId: winner,
          members,
        },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'done',
      payload: { kept: kept.length, discarded, totalWeight },
    });
    return true;
  };

  for (;;) {
    if (!(await playOnce())) return;
    manual = true;
    // 완료 화면에서 advance 를 기다린다. 누르면 되감고 첫 걸음까지 보인다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'rewind' });
    skipNextGate = true;
  }
};
