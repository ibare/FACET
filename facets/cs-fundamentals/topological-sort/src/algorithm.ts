/**
 * 위상 정렬 (칸 알고리즘) — 들어오는 화살이 없는 것부터 꺼낸다.
 *
 * 하나를 꺼낼 때마다 그것이 가리키던 것들의 "들어오는 화살 수" 가 하나씩 준다.
 * 그러다 0 이 된 것이 줄로 떨어지고, 그것이 또 다음 것을 0 으로 만든다.
 * 끝까지 갔는데 꺼낸 수가 정점 수에 못 미치면 그래프에 고리가 있다는 뜻이다.
 *
 * ── 식별자 (C1)
 *
 *   node:<v>        정점 v
 *   edge:<u>-<v>    u 에서 v 로 가는 화살
 *   queue:<v>       줄에 놓인/줄에서 나온 정점 v
 *
 * ── 이벤트 (C2)
 *
 * | type              | target        | payload                              | silent |
 * |-------------------|---------------|--------------------------------------|--------|
 * | phase             | —             | { phase: string }                    | true   |
 * | highlight         | edge:<u>-<v>  | { from: number; to: number }         | false  |
 * | unhighlight       | edge:<u>-<v>  | { from: number; to: number }         | false  |
 * | indegree-changed  | node:<v>      | { vertex, value, delta }             | false  |
 * | enqueue           | queue:<v>     | { vertex: number; tail: number }     | false  |
 * | dequeue           | queue:<v>     | { vertex: number; head: number }     | false  |
 * | append            | node:<v>      | { vertex: number; slot: number }     | false  |
 * | done              | —             | { taken, total, cyclic, order }      | false  |
 *
 * `indegree-changed` 는 표준 어휘에 없는 이 facet 고유 이벤트다. `state-changed`
 * 로 뭉뚱그리지 않는 이유는 이 알고리즘에서 바뀌는 상태가 오직 하나 — 들어오는
 * 화살의 수 — 이고, 그 수 자체가 화면에 뜨는 값이기 때문이다.
 *
 * `enqueue` / `dequeue` / `append` 는 표준 어휘를 그 뜻 그대로 쓴다. 줄에 놓고,
 * 줄에서 꺼내고, 결과 줄 끝에 붙인다.
 *
 * ── phase 어휘 (C3) — `irs.ts` 와 글자까지 같다
 *
 *   'count-indegree' | 'seed-queue' | 'enqueue' | 'pop' | 'emit-order' |
 *   'relax' | 'zero-reached' | 'cycle-check' | 'done'
 *
 * ── 메트릭 (C5) — `facet.ts` 에 선언된 것과 같다
 *
 *   'pop-count' · 'enqueue-count' · 'decrement-count'
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type TopologicalSortEdge = { from: number; to: number };

export type TopologicalSortData = {
  type: 'digraph';
  /** 정점 번호는 0 … vertexCount - 1. */
  vertexCount: number;
  /** 방향 간선. 화면 좌표는 stage 가 셈한다 — 여기에는 구조만 둔다. */
  edges: TopologicalSortEdge[];
};

/**
 * 간선 목록에서 인접 목록을 만든다.
 *
 * 나가는 쪽 번호로 묶고 닿는 쪽 번호로 오름차순 정렬한다. 정렬해 두면 훑는
 * 차례가 선언 순서에 흔들리지 않아, 재생할 때마다 같은 그림이 나온다.
 */
function buildAdjacency(data: TopologicalSortData): number[][] {
  const adj: number[][] = [];
  for (let u = 0; u < data.vertexCount; u += 1) adj.push([]);
  for (const e of data.edges) {
    if (e.from < 0 || e.from >= data.vertexCount || e.to < 0 || e.to >= data.vertexCount) {
      throw new Error(`위상 정렬: 정점 범위를 벗어난 간선 ${e.from}→${e.to}`);
    }
    adj[e.from].push(e.to);
  }
  for (const row of adj) row.sort((a, b) => a - b);
  return adj;
}

export const topologicalSort = async (
  ctx: FacetContext<TopologicalSortData>,
): Promise<void> => {
  const data = ctx.data;
  const n = data.vertexCount;
  const adj = buildAdjacency(data);

  /** phase 는 호출부에 리터럴로 나타난다 (C3). */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const indeg: number[] = new Array<number>(n).fill(0);
  const queue: number[] = new Array<number>(n).fill(-1);
  const order: number[] = new Array<number>(n).fill(-1);

  // ── 들어오는 화살을 센다.
  await phase('count-indegree');
  for (let u = 0; u < n; u += 1) {
    if (ctx.cancelled) return;
    for (let i = 0; i < adj[u].length; i += 1) {
      if (ctx.cancelled) return;
      const v = adj[u][i];
      await ctx.emit({ type: 'highlight', target: `edge:${u}-${v}`, payload: { from: u, to: v } });
      indeg[v] += 1;
      await ctx.emit({
        type: 'indegree-changed',
        target: `node:${v}`,
        payload: { vertex: v, value: indeg[v], delta: 1 },
      });
      await ctx.emit({
        type: 'unhighlight',
        target: `edge:${u}-${v}`,
        payload: { from: u, to: v },
      });
    }
  }
  if (ctx.cancelled) return;

  // ── 큐는 배열 하나와 색인 둘이다. head 는 다음에 꺼낼 자리, tail 은 놓을 자리.
  let head = 0;
  let tail = 0;
  await phase('seed-queue');
  for (let u = 0; u < n; u += 1) {
    if (ctx.cancelled) return;
    if (indeg[u] === 0) {
      await phase('enqueue');
      queue[tail] = u;
      await ctx.emit({ type: 'enqueue', target: `queue:${u}`, payload: { vertex: u, tail } });
      ctx.metric('enqueue-count', 'inc');
      tail += 1;
    }
  }
  if (ctx.cancelled) return;

  // ── 하나 꺼낼 때마다 뒤따르는 것들의 수가 하나씩 준다.
  while (head < tail) {
    if (ctx.cancelled) return;
    const u = queue[head];
    await phase('pop');
    await ctx.emit({ type: 'dequeue', target: `queue:${u}`, payload: { vertex: u, head } });
    ctx.metric('pop-count', 'inc');

    await phase('emit-order');
    order[head] = u;
    await ctx.emit({ type: 'append', target: `node:${u}`, payload: { vertex: u, slot: head } });
    head += 1;

    for (let i = 0; i < adj[u].length; i += 1) {
      if (ctx.cancelled) return;
      const v = adj[u][i];
      await phase('relax');
      await ctx.emit({ type: 'highlight', target: `edge:${u}-${v}`, payload: { from: u, to: v } });
      indeg[v] -= 1;
      ctx.metric('decrement-count', 'inc');
      await ctx.emit({
        type: 'indegree-changed',
        target: `node:${v}`,
        payload: { vertex: v, value: indeg[v], delta: -1 },
      });
      await ctx.emit({
        type: 'unhighlight',
        target: `edge:${u}-${v}`,
        payload: { from: u, to: v },
      });
      if (indeg[v] === 0) {
        await phase('zero-reached');
        await phase('enqueue');
        queue[tail] = v;
        await ctx.emit({ type: 'enqueue', target: `queue:${v}`, payload: { vertex: v, tail } });
        ctx.metric('enqueue-count', 'inc');
        tail += 1;
      }
    }
  }
  if (ctx.cancelled) return;

  // ── 꺼낸 수가 정점 수에 못 미치면 고리가 남아 있다는 뜻이다.
  await phase('cycle-check');
  const cyclic = head < n;
  await phase('done');
  await ctx.emit({
    type: 'done',
    payload: { taken: head, total: n, cyclic, order: order.slice(0, head) },
  });
};

/**
 * 재생 없이 결과만 셈한다 — 검사와 호스트가 대조에 쓴다.
 *
 * 위 알고리즘과 같은 절차를 이벤트 없이 돌린다. 고리가 있으면 `order` 가
 * 정점 수보다 짧다.
 */
export function computeTopologicalSortResult(data: TopologicalSortData): {
  order: number[];
  cyclic: boolean;
} {
  const n = data.vertexCount;
  const adj = buildAdjacency(data);
  const indeg: number[] = new Array<number>(n).fill(0);
  for (let u = 0; u < n; u += 1) for (const v of adj[u]) indeg[v] += 1;

  const queue: number[] = [];
  for (let u = 0; u < n; u += 1) if (indeg[u] === 0) queue.push(u);

  const order: number[] = [];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head];
    order.push(u);
    head += 1;
    for (const v of adj[u]) {
      indeg[v] -= 1;
      if (indeg[v] === 0) queue.push(v);
    }
  }
  return { order, cyclic: order.length < n };
}
