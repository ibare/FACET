/**
 * 서로 오갈 수 있는 무리 — 한쪽으로만 갈 수 있으면 한 무리가 아니다.
 *
 * ── 왜 코사라주도 타잔도 아닌가
 *
 * 이 조각이 뒷받침하는 주장은 "오갈 수 있어야 한 무리다" 하나다. 코사라주는
 * 간선을 뒤집어 두 번 훑고, 타잔은 low-link 수를 굴린다 — 둘 다 **왜 그것이
 * 무리인지를 화면에서 감춘다.** 보이는 것이 방문 순서와 번호가 되어 버려, 정작
 * 물어야 할 "저 둘은 서로 갈 수 있나" 는 한 번도 화면에 뜨지 않는다.
 *
 * 그래서 여기서는 정의를 그대로 묻는다. 두 정점을 짚어 한쪽으로 가 보고,
 * 반대쪽으로도 가 본 뒤에 판정한다. 정점이 다섯이라 그렇게 해도 걸음 수가 적다.
 *
 * 다만 모든 짝을 다 묻지는 않는다. 서로 오갈 수 있다는 관계는 **동치관계**라
 * 두 가지 지름길이 성립하고, 둘 다 이 알고리즘이 실제로 쓰는 것이다.
 *
 *   1. 대표 하나와만 물으면 된다. u 와 v 가 오가고 u 와 w 가 오가면 v 와 w 도
 *      오간다. 그래서 무리마다 대표 u 를 세우고 아직 무리가 없는 나머지를
 *      u 하고만 견준다.
 *   2. 막힌 답사는 한 덩이를 통째로 지운다. v 에서 u 로 갈 길이 없을 때, v 가
 *      닿을 수 있는 곳 전부(region)는 어느 것도 u 에 닿지 못한다 — 닿는다면
 *      v 도 그리로 돌아 u 에 닿았을 것이다. 그래서 region 전체를 u 의 무리
 *      후보에서 뺀다. 반대로 u 가 v 에 못 가는 경우라면, u 가 닿지 못하는
 *      곳 전부가 후보에서 빠진다.
 *
 * 이 둘 덕에 정점 다섯 · 짝 열 중 실제로 묻는 것은 넷이고, 나머지는 물을 까닭이
 * 사라져서 묻지 않는 것이지 건너뛰는 것이 아니다.
 *
 * ── 식별자
 *
 *   node:<id>   정점
 *
 * ── 이벤트 (전부 facet 고유. 표준 어휘는 `done` 뿐이다)
 *
 *   probe-begin    { u: string; v: string }
 *                  두 정점을 짚는다. 아직 아무것도 묻지 않았다.
 *   reach-found    { from: string; to: string; path: string[] }
 *                  from 에서 to 로 가는 길을 찾았다. path 는 정점 열(from 포함).
 *   reach-blocked  { from: string; to: string; region: string[] }
 *                  from 에서 to 로 갈 길이 없다. region 은 from 이 닿을 수 있는
 *                  곳 전부(from 포함) — 여기서 바깥으로 나가는 길이 없다.
 *   pair-verdict   { u: string; v: string; mutual: boolean }
 *                  두 방향을 다 물어 본 뒤의 판정.
 *   group-settled  { group: number; members: string[] }
 *                  대표 u 의 무리가 확정됐다.
 *   split          { groups: string[][]; bridges: { from: string; to: string }[];
 *                    oneWayCount: number }
 *                  무리끼리 갈린다. bridges 는 서로 다른 무리를 잇는 간선,
 *                  oneWayCount 는 그중 되돌아오는 짝이 없는 것의 수.
 *   rewind         (payload 없음)
 *                  자동 재생이 끝난 뒤 `advance` 로 처음으로 되감는다.
 *   done           { groupCount: number }
 *
 * silent 인 이벤트는 없다 — 전부 화면이 바뀌는 걸음이다.
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MutuallyReachableEdge = { from: string; to: string };

export type MutuallyReachableData = {
  type: 'mutually-reachable';
  /** 정점 이름. 화면 라벨이자 식별자다. */
  nodes: string[];
  /** 방향 간선. from → to 한 방향으로만 간다. */
  edges: MutuallyReachableEdge[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정이라 선언에 둔다. */
  stepMs: number;
};

/**
 * 걸음마다의 간격 배수.
 *
 * 하나로 두면 짚는 순간과 판정하는 순간이 같은 무게가 된다. 답사는 그림이 스스로
 * 움직이는 동안 읽히므로 뒤에 붙는 간격이 짧아도 되고, 판정은 읽고 넘어가야 하니
 * 길어야 한다.
 */
const GATE_ASK = 0.5;
const GATE_WALK = 0.7;
const GATE_VERDICT = 0.9;
const GATE_SETTLE = 0.7;
const GATE_SPLIT = 1.2;

/** 걸음 사이의 문. true 면 계속, false 면 러너가 접은 것이다. */
type Gate = (weight: number) => Promise<boolean>;

function buildAdjacency(
  nodes: string[],
  edges: MutuallyReachableEdge[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    const out = adj.get(e.from);
    if (!out) throw new Error(`간선의 출발 정점이 nodes 에 없음: ${e.from}`);
    if (!adj.has(e.to)) throw new Error(`간선의 도착 정점이 nodes 에 없음: ${e.to}`);
    out.push(e.to);
  }
  return adj;
}

/** from 에서 to 로 가는 가장 짧은 정점 열. 길이 없으면 null. */
function findRoute(adj: Map<string, string[]>, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const route = [to];
        let walk = to;
        while (walk !== from) {
          walk = prev.get(walk) as string;
          route.unshift(walk);
        }
        return route;
      }
      queue.push(next);
    }
  }
  return null;
}

/** from 이 닿을 수 있는 곳 전부. 발견 순서이며 from 을 포함한다. */
function reachableFrom(adj: Map<string, string[]>, from: string): string[] {
  const seen = new Set<string>([from]);
  const order: string[] = [from];
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      order.push(next);
      queue.push(next);
    }
  }
  return order;
}

/**
 * 한 회차 전체. 문(gate)은 emit **뒤에** 둔다 — 그래야 되감기 직후 첫 emit 이
 * 곧바로 나가고, `advance` 첫 누름이 되감기와 첫 걸음을 함께 보인다 (S-piece).
 */
async function play(ctx: ReactiveContext<MutuallyReachableData>, gate: Gate): Promise<void> {
  const { nodes, edges } = ctx.data;
  const adj = buildAdjacency(nodes, edges);

  const groupOf = new Map<string, number>();
  const groups: string[][] = [];

  for (const u of nodes) {
    if (groupOf.has(u)) continue;

    const group = groups.length;
    const members: string[] = [u];
    groups.push(members);
    groupOf.set(u, group);

    // 이번 대표의 무리가 아님이 이미 드러난 정점들. 막힌 답사가 통째로 채운다.
    const ruledOut = new Set<string>();

    for (const v of nodes) {
      if (v === u || groupOf.has(v) || ruledOut.has(v)) continue;

      await ctx.emit({
        type: 'probe-begin',
        target: [`node:${u}`, `node:${v}`],
        payload: { u, v },
      });
      if (!(await gate(GATE_ASK))) return;

      let mutual = false;
      const forward = findRoute(adj, u, v);

      if (forward === null) {
        // u 가 v 에 못 간다. u 가 닿지 못하는 곳은 전부 u 의 무리가 아니다.
        const region = reachableFrom(adj, u);
        await ctx.emit({
          type: 'reach-blocked',
          target: `node:${v}`,
          payload: { from: u, to: v, region },
        });
        if (!(await gate(GATE_WALK))) return;
        for (const w of nodes) {
          if (!region.includes(w)) ruledOut.add(w);
        }
      } else {
        await ctx.emit({
          type: 'reach-found',
          target: `node:${v}`,
          payload: { from: u, to: v, path: forward },
        });
        if (!(await gate(GATE_WALK))) return;

        const backward = findRoute(adj, v, u);
        if (backward === null) {
          // v 가 닿는 곳은 어느 것도 u 에 닿지 못한다. 그 덩이를 통째로 뺀다.
          const region = reachableFrom(adj, v);
          await ctx.emit({
            type: 'reach-blocked',
            target: `node:${u}`,
            payload: { from: v, to: u, region },
          });
          if (!(await gate(GATE_WALK))) return;
          for (const w of region) ruledOut.add(w);
        } else {
          await ctx.emit({
            type: 'reach-found',
            target: `node:${u}`,
            payload: { from: v, to: u, path: backward },
          });
          if (!(await gate(GATE_WALK))) return;
          mutual = true;
        }
      }

      await ctx.emit({
        type: 'pair-verdict',
        target: [`node:${u}`, `node:${v}`],
        payload: { u, v, mutual },
      });
      if (!(await gate(GATE_VERDICT))) return;

      if (mutual) {
        members.push(v);
        groupOf.set(v, group);
      }
    }

    await ctx.emit({
      type: 'group-settled',
      target: members.map((m) => `node:${m}`),
      payload: { group, members: [...members] },
    });
    if (!(await gate(GATE_SETTLE))) return;
  }

  const bridges = edges.filter((e) => groupOf.get(e.from) !== groupOf.get(e.to));
  const oneWayCount = bridges.filter(
    (e) => !bridges.some((o) => o.from === e.to && o.to === e.from),
  ).length;

  await ctx.emit({
    type: 'split',
    payload: {
      groups: groups.map((m) => [...m]),
      bridges: bridges.map((e) => ({ from: e.from, to: e.to })),
      oneWayCount,
    },
  });
  if (!(await gate(GATE_SPLIT))) return;

  await ctx.emit({ type: 'done', payload: { groupCount: groups.length } });
}

export const mutuallyReachableAlgorithm = async (
  ctx: FacetContext<MutuallyReachableData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<MutuallyReachableData>;
  const stepMs = rc.data.stepMs;

  // 자동 재생 — 스스로 시간을 흘려보낸다.
  await play(rc, (weight) => rc.sleep(stepMs * weight));

  // 다 보인 뒤에는 `advance` 를 기다린다. 곱씹으며 한 걸음씩 짚어 보려는 사람 몫이다.
  try {
    for (;;) {
      const first = await rc.waitForInput();
      // 지금은 메커니즘이 advance 만 흘려보내지만, 위젯 입력이 붙으면
      // 아무 dispatch 나 걸음으로 세게 된다. 종류를 본다.
      if (first.type !== 'advance') continue;

      await rc.emit({ type: 'rewind' });
      await play(rc, async () => {
        for (;;) {
          const ev = await rc.waitForInput();
          if (ev.type === 'advance') return true;
        }
      });
    }
  } catch (err) {
    // 기다리는 중에 러너가 접었다 — ReactiveMechanism 이 waitForInput 을
    // 'cancelled' 로 reject 한다. 되돌릴 상태가 없으므로 조용히 끝낸다.
    // 그 밖의 오류는 삼키지 않고 올려 보낸다 (C6).
    if ((err as Error | undefined)?.message !== 'cancelled') throw err;
  }
};
