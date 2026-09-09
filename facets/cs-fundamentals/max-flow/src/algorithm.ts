/**
 * 최대 유량 — 에드몬즈-카프.
 *
 * 여유가 남은 길을 너비 우선으로 찾아 그 길의 병목만큼 흘리기를, 더 찾을 길이
 * 없을 때까지 되풀이한다. 흘릴 때마다 반대 방향에 같은 만큼 되돌릴 폭이 생긴다
 * (`cap[v][u] += f`) — 그 폭이 있어야 "더 찾을 길이 없다" 가 "최대에 닿았다" 를
 * 뜻한다.
 *
 * ── 식별자
 *
 *   node:<i>        정점. i 는 0 … nodeCount-1
 *   edge:<u>-<v>    방향 있는 잔여 간선 (u 에서 v 로 남은 여유)
 *
 * ── 이벤트 (표준 어휘: enqueue · dequeue · done. 나머지는 이 facet 고유)
 *
 *   phase           silent. { phase: string }
 *   search-begin    { round: number; queue: number[]; head: number }
 *                   새 너비 우선 탐색을 시작한다. 지난 탐색 표시를 지운다.
 *   dequeue         target node:<u>. { node, head, tail, queue: number[] }
 *                   큐의 머리에서 정점 하나를 꺼낸다.
 *   probe-edge      target edge:<u>-<v>. { from, to, residual, open: boolean }
 *                   그 관에 여유가 남았는지, 아직 안 닿은 정점인지 살핀다.
 *   enqueue         target node:<v>. { node, from, head, tail, queue: number[] }
 *                   여유가 있어 부모를 정하고 큐 꼬리에 붙인다.
 *   path-found      { path: number[] }  들어오는 곳부터 나가는 곳까지의 정점 열.
 *   no-path         { total: number }   여유가 남은 길이 더 없다.
 *   bottleneck-scan target edge:<u>-<v>. { from, to, residual, best, improved }
 *                   경로를 거슬러 오르며 가장 좁은 관을 찾는다.
 *   push-flow       target edge:<u>-<v>. { from, to, amount, residual }
 *                   cap[u][v] -= f. 관이 차오르고 여유가 준다.
 *   residual-grown  target edge:<v>-<u>. { from, to, amount, residual }
 *                   cap[v][u] += f. 되돌릴 폭이 생긴다.
 *   flow-added      { amount, total }
 *   done            { total, paths }
 *
 * ── phase 어휘 (irs.ts 와 글자까지 같아야 한다 — C3)
 *
 *   'setup' | 'reset-search' | 'bfs-pop' | 'probe-edge' | 'discover' |
 *   'no-path' | 'bottleneck' | 'push-flow' | 'add-residual' |
 *   'accumulate' | 'done'
 *
 * ── 메트릭 (facet.ts 의 metrics 선언과 같아야 한다 — C5)
 *
 *   probe-count · path-count · flow-sum
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type MaxFlowEdge = { from: number; to: number; capacity: number };

export type MaxFlowData = {
  type: 'max-flow';
  nodeCount: number;
  source: number;
  sink: number;
  edges: MaxFlowEdge[];
};

/** 방향 간선 목록을 잔여 용량 표로 편다. 반대 방향 칸은 0 에서 시작한다. */
export function buildCapacityMatrix(data: MaxFlowData): number[][] {
  const cap: number[][] = [];
  for (let i = 0; i < data.nodeCount; i += 1) cap.push(new Array<number>(data.nodeCount).fill(0));
  for (const e of data.edges) cap[e.from][e.to] += e.capacity;
  return cap;
}

/**
 * 두 정점 사이에 관이 있는지. 어느 방향으로든 용량이 선언되어 있으면 관이다.
 *
 * 화면에 그려질 관만 살피는 장면을 내보내려고 쓴다 — 코드의 `for w in range(n)`
 * 은 정점 전부를 훑지만, 관이 아예 없는 자리는 볼 것이 없어 걸음을 나누지 않는다.
 */
function buildConduitMatrix(data: MaxFlowData): boolean[][] {
  const n = data.nodeCount;
  const conduit: boolean[][] = [];
  for (let i = 0; i < n; i += 1) conduit.push(new Array<boolean>(n).fill(false));
  for (const e of data.edges) {
    if (e.capacity <= 0) continue;
    conduit[e.from][e.to] = true;
    conduit[e.to][e.from] = true;
  }
  return conduit;
}

export const maxFlowAlgorithm = async (ctx: FacetContext<MaxFlowData>): Promise<void> => {
  const data = ctx.data;
  const n = data.nodeCount;
  const source = data.source;
  const sink = data.sink;

  const cap = buildCapacityMatrix(data);
  const conduit = buildConduitMatrix(data);
  const parent = new Array<number>(n).fill(-1);
  const queue = new Array<number>(n).fill(0);

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  await phase('setup');
  let flow = 0;
  let round = 0;

  for (;;) {
    if (ctx.cancelled) return;
    round += 1;

    // ── 지난 탐색을 지운다. 부모가 정해졌는지가 곧 방문 표시다.
    await phase('reset-search');
    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return;
      parent[i] = -1;
    }
    parent[source] = source;
    let head = 0;
    let tail = 0;
    queue[tail] = source;
    tail += 1;
    await ctx.emit({
      type: 'search-begin',
      payload: { round, queue: queue.slice(0, tail), head },
    });

    // ── 너비 우선. 머리에서 꺼내고 꼬리에 붙이므로 간선 수가 가장 적은 길이
    //    먼저 닿는다.
    while (head < tail) {
      if (ctx.cancelled) return;
      await phase('bfs-pop');
      const u = queue[head];
      head += 1;
      await ctx.emit({
        type: 'dequeue',
        target: `node:${u}`,
        payload: { node: u, head, tail, queue: queue.slice(0, tail) },
      });

      for (let w = 0; w < n; w += 1) {
        if (ctx.cancelled) return;
        const open = parent[w] === -1 && cap[u][w] > 0;
        if (conduit[u][w]) {
          await phase('probe-edge');
          ctx.metric('probe-count', 'inc');
          await ctx.emit({
            type: 'probe-edge',
            target: `edge:${u}-${w}`,
            payload: { from: u, to: w, residual: cap[u][w], open },
          });
        }
        if (!open) continue;
        parent[w] = u;
        queue[tail] = w;
        tail += 1;
        await phase('discover');
        await ctx.emit({
          type: 'enqueue',
          target: `node:${w}`,
          payload: { node: w, from: u, head, tail, queue: queue.slice(0, tail) },
        });
      }
    }

    await phase('no-path');
    if (parent[sink] === -1) {
      await ctx.emit({ type: 'no-path', payload: { total: flow } });
      break;
    }

    const path: number[] = [sink];
    for (let x = sink; x !== source; x = parent[x]) {
      if (ctx.cancelled) return;
      path.push(parent[x]);
    }
    path.reverse();
    ctx.metric('path-count', 'inc');
    await ctx.emit({ type: 'path-found', payload: { path } });

    // ── 병목. 경로를 거슬러 오르며 가장 좁은 관을 찾는다.
    await phase('bottleneck');
    let f = cap[parent[sink]][sink];
    let v = sink;
    while (v !== source) {
      if (ctx.cancelled) return;
      const u = parent[v];
      const improved = cap[u][v] < f;
      if (improved) f = cap[u][v];
      await phase('bottleneck');
      await ctx.emit({
        type: 'bottleneck-scan',
        target: `edge:${u}-${v}`,
        payload: { from: u, to: v, residual: cap[u][v], best: f, improved },
      });
      v = u;
    }

    // ── 흘리고 되돌린다.
    await phase('push-flow');
    v = sink;
    while (v !== source) {
      if (ctx.cancelled) return;
      const u = parent[v];
      cap[u][v] -= f;
      await phase('push-flow');
      await ctx.emit({
        type: 'push-flow',
        target: `edge:${u}-${v}`,
        payload: { from: u, to: v, amount: f, residual: cap[u][v] },
      });
      cap[v][u] += f;
      await phase('add-residual');
      await ctx.emit({
        type: 'residual-grown',
        target: `edge:${v}-${u}`,
        payload: { from: v, to: u, amount: f, residual: cap[v][u] },
      });
      v = u;
    }

    flow += f;
    ctx.metric('flow-sum', f);
    await phase('accumulate');
    await ctx.emit({ type: 'flow-added', payload: { amount: f, total: flow } });
  }

  await phase('done');
  await ctx.emit({ type: 'done', payload: { total: flow, paths: round - 1 } });
};
