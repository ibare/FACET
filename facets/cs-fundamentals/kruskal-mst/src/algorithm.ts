/**
 * 크루스칼 — 가벼운 간선부터 집되 고리가 되면 버린다.
 *
 * 무게 순으로 줄 세운 간선을 위에서부터 하나씩 집는다. 양 끝이 이미 같은 무리면
 * 잇는 순간 고리가 되므로 버리고, 다른 무리면 이어 붙여 둘을 하나로 만든다.
 * 흩어져 있던 일곱 무리가 하나로 합쳐지면 최소 신장 트리가 남는다.
 *
 * ── 식별자
 *
 *   `edge:<u>-<v>`   간선. u · v 는 초기 데이터에 적힌 순서 그대로의 정점 번호.
 *   `node:<i>`       정점.
 *
 * ── 이벤트 (payload 스키마 · silent 여부)
 *
 *   phase          { phase: string }                                  silent
 *                  코드 패널 줄 맞춤 전용. 시각 변화 없음.
 *   sort-swap      { a: number, b: number }                           step
 *                  줄에서 이웃한 두 자리 a · b 를 맞바꾼다 (a = b - 1).
 *   state-changed  { roots: number[], total: number }                 step
 *                  무리 지도. roots[i] 는 정점 i 가 속한 무리의 뿌리.
 *                  total 은 그때까지 집은 간선의 무게 합.
 *   highlight      target `edge:<u>-<v>`                              step
 *                  { slot: number, id: number, u, v, w: number }
 *                  줄의 slot 번째(0 부터) 자리에서 간선 하나를 집어 든다.
 *                  id 는 초기 데이터에서의 간선 번호 — 줄이 섞여도 변하지 않는다.
 *   roots-found    { u, v, rootU, rootV: number }                     step
 *                  두 끝을 타고 올라가 만난 뿌리 둘.
 *   mark           target [`node:<rootU>`, `node:<rootV>`]            step
 *                  { same: boolean }  뿌리 둘을 견준 결과.
 *   edge-linked    target `edge:<u>-<v>`  { slot, id: number }        step
 *                  잇는다. 이 간선이 최소 신장 트리에 들어간다.
 *   edge-dropped   target `edge:<u>-<v>`  { slot, id: number }        step
 *                  버린다. 고리가 되므로 줄에서 떨어진다.
 *   done           { picked, dropped, total: number }                 step
 *
 * ── phase 어휘 (irs.ts 와 글자까지 같아야 한다 — C3)
 *
 *   'setup' | 'make-set' | 'sort-scan' | 'sort-swap' | 'take-edge' |
 *   'find-root' | 'cycle-check' | 'discard' | 'union' | 'accumulate' | 'answer'
 *
 * ── 메트릭 (facet.ts 의 선언과 같은 이름 — C5)
 *
 *   'pick-count' · 'drop-count' · 'weight-sum'
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type KruskalEdge = {
  /** 한쪽 끝 정점 번호. */
  u: number;
  /** 다른 쪽 끝 정점 번호. */
  v: number;
  /** 무게. */
  w: number;
};

export type KruskalMstData = {
  type: 'kruskal-mst';
  /** 정점은 0 … vertexCount - 1. */
  vertexCount: number;
  /** 무방향 간선. 적힌 차례는 무게 순이 아니다. */
  edges: KruskalEdge[];
};

/** 뿌리에 닿을 때까지 부모를 타고 올라간다. 경로 압축은 하지 않는다 (irs.ts 참조). */
function find(parent: number[], start: number): number {
  let x = start;
  while (parent[x] !== x) x = parent[x];
  return x;
}

/** 정점마다 지금 속한 무리의 뿌리. 화면의 무리 색이 이 배열에서 나온다. */
function rootsOf(parent: number[]): number[] {
  return parent.map((_, i) => find(parent, i));
}

export const kruskalMstAlgorithm = async (ctx: FacetContext<KruskalMstData>): Promise<void> => {
  const n = ctx.data.vertexCount;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 줄. 자리마다 간선 하나가 서 있고, id 는 초기 데이터에서의 번호라 줄이
  // 섞여도 변하지 않는다 — 화면의 칩과 간선을 이어 주는 것이 이 번호다.
  const line = ctx.data.edges.map((e, id) => ({ id, u: e.u, v: e.v, w: e.w }));
  const m = line.length;

  await phase('setup');

  const parent = Array.from({ length: n }, (_, i) => i);
  await phase('make-set');
  await ctx.emit({ type: 'state-changed', payload: { roots: rootsOf(parent), total: 0 } });
  if (ctx.cancelled) return;

  // 무게 순으로 줄 세우기. 이웃이 더 무거울 때만 맞바꾸므로 같은 무게는
  // 적힌 차례를 지킨다 (2–4 가 0–3 보다, 1–2 가 4–5 보다 앞에 선다).
  for (let i = 1; i < m; i += 1) {
    // 바깥 루프에도 검사가 있어야 한다 — 안쪽 while 이 한 번도 안 도는 구간
    // (이미 제자리인 간선)에서는 아래 검사를 지나치지 않아 취소가 안 먹는다.
    // 바디 첫 줄이 `await phase(...)` 인데 phase 는 silent 라 러너가 멈춰 세울
    // 지점도 아니다 (C8).
    if (ctx.cancelled) return;
    await phase('sort-scan');
    let j = i;
    while (j > 0 && line[j - 1].w > line[j].w) {
      if (ctx.cancelled) return;
      const hold = line[j - 1];
      line[j - 1] = line[j];
      line[j] = hold;
      await phase('sort-swap');
      await ctx.emit({ type: 'sort-swap', payload: { a: j - 1, b: j } });
      if (ctx.cancelled) return;
      j -= 1;
    }
  }

  let total = 0;
  let picked = 0;
  let dropped = 0;

  for (let k = 0; k < m; k += 1) {
    if (ctx.cancelled) return;
    const e = line[k];
    const edgeTarget = `edge:${e.u}-${e.v}`;

    await phase('take-edge');
    await ctx.emit({
      type: 'highlight',
      target: edgeTarget,
      payload: { slot: k, id: e.id, u: e.u, v: e.v, w: e.w },
    });
    if (ctx.cancelled) return;

    await phase('find-root');
    const rootU = find(parent, e.u);
    const rootV = find(parent, e.v);
    await ctx.emit({ type: 'roots-found', payload: { u: e.u, v: e.v, rootU, rootV } });
    if (ctx.cancelled) return;

    await phase('cycle-check');
    await ctx.emit({
      type: 'mark',
      target: [`node:${rootU}`, `node:${rootV}`],
      payload: { same: rootU === rootV },
    });
    if (ctx.cancelled) return;

    if (rootU === rootV) {
      await phase('discard');
      dropped += 1;
      ctx.metric('drop-count', 'inc');
      await ctx.emit({ type: 'edge-dropped', target: edgeTarget, payload: { slot: k, id: e.id } });
      if (ctx.cancelled) return;
      continue;
    }

    await phase('union');
    parent[rootU] = rootV;
    picked += 1;
    ctx.metric('pick-count', 'inc');
    await ctx.emit({ type: 'edge-linked', target: edgeTarget, payload: { slot: k, id: e.id } });
    if (ctx.cancelled) return;

    await phase('accumulate');
    total += e.w;
    ctx.metric('weight-sum', e.w);
    await ctx.emit({ type: 'state-changed', payload: { roots: rootsOf(parent), total } });
    if (ctx.cancelled) return;
  }

  await phase('answer');
  await ctx.emit({ type: 'done', payload: { picked, dropped, total } });
};
