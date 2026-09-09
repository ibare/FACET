/**
 * 다익스트라 — 한 점에서 모든 점까지의 최단 경로.
 *
 * 아직 확정되지 않은 것 중 가장 가까운 것을 굳히고, 그 이웃을 편다. 하나를
 * 확정할 때마다 그 둘레의 잠정 거리가 갱신되고, **굳은 값은 다시 흔들리지 않는다.**
 *
 * 고르는 일을 우선순위 큐로 감싸지 않는다. 미확정 정점을 처음부터 끝까지 훑어
 * 가장 작은 것을 찾는 그 반복문이 이 알고리즘의 절반이며, 그래서 이 판은 O(V²) 다.
 * 같은 형태가 `irs.ts` 에 그대로 있고 재생 중인 phase 가 그 줄을 짚는다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<정점 번호>`        정점. 0-based.
 *   `edge:<작은쪽>-<큰쪽>`    무방향 간선. 양끝을 정렬해 한 이름으로 묶는다.
 *   `graph`                   그림 전체.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type            | target        | payload                                                                        | silent |
 * | --------------- | ------------- | ------------------------------------------------------------------------------ | ------ |
 * | `phase`         | —             | `{ phase: string }`                                                            | yes    |
 * | `state-changed` | `graph`       | `{ source, dist: (number\|null)[], settled: boolean[], parent: (number\|null)[] }` | no  |
 * | `round-begin`   | —             | `{ round: number }`                                                            | no     |
 * | `scan-step`     | `node:<i>`    | `{ node, settled, dist: number\|null, best: number\|null, bestNode: number\|null }` | no  |
 * | `best-update`   | `node:<i>`    | `{ node, dist }`                                                               | no     |
 * | `choose`        | `node:<u>`    | `{ node, dist }`                                                               | no     |
 * | `settle`        | `node:<u>`    | `{ node, dist, order, path: number[] }`                                        | no     |
 * | `relax-check`   | `edge:<a>-<b>`| `{ from, to, weight, through, current: number\|null, improved: boolean }`       | no     |
 * | `relax-apply`   | `node:<v>`    | `{ node, before: number\|null, after, parent }`                                | no     |
 * | `done`          | —             | `{ dist: number[], order: number[] }`                                          | no     |
 *
 * `dist` 안의 `null` 은 무한대 — 아직 닿은 적이 없다는 뜻이다.
 *
 * ── phase 어휘 (C3). `irs.ts` 와 글자 단위로 같다
 *
 *   'init' | 'round-begin' | 'scan' | 'pick-min' | 'stop-check' |
 *   'settle' | 'relax-check' | 'relax-apply' | 'return-dist'
 *
 * ── 메트릭 (C5). `facet.ts` 의 선언과 이름이 같다
 *
 *   'scan-count'     미확정 훑기에서 들여다본 자리 수. n 회 × n 자리 = O(V²) 의 실측
 *   'settle-count'   굳힌 정점 수
 *   'improve-count'  실제로 더 짧아진 잠정 거리의 수
 */

import type { FacetContext } from '@ffacet/core/runtime';

/** 무방향 간선 하나. 양끝 정점 번호와 무게. */
export type DijkstraEdge = { a: number; b: number; w: number };

export type DijkstraData = {
  type: string;
  /** 정점 수. 정점 번호는 0 .. vertexCount - 1. */
  vertexCount: number;
  /** 무방향 간선 목록. 무게는 모두 양수여야 한다 (전제는 description 이 진다). */
  edges: DijkstraEdge[];
  /** 출발 정점 번호. */
  source: number;
};

/**
 * 무한대 대신 쓰는 큰 수. `irs.ts` 의 `INF` 와 같은 값이라 두 쪽이 같은 판을 돈다.
 * 화면으로 나갈 때는 `null` 로 바꿔 보낸다 (∞ 를 그리는 것은 stage 의 일).
 */
const INF = 1000000000;

/** 무한대면 `null`. 화면 계층은 "닿은 적 없음" 을 이 값으로 읽는다. */
function shown(d: number): number | null {
  return d === INF ? null : d;
}

/** `edge:<작은쪽>-<큰쪽>` — 무방향이라 양끝을 정렬해 한 이름으로 묶는다. */
function edgeId(a: number, b: number): string {
  return a < b ? `edge:${a}-${b}` : `edge:${b}-${a}`;
}

/** 부모를 거슬러 출발점까지의 길을 편다. 반환은 출발점 → 해당 정점 순서. */
function pathTo(parent: (number | null)[], node: number): number[] {
  const out: number[] = [];
  let cur: number | null = node;
  // 부모 사슬은 최단 경로 나무라 순환이 없다. 그래도 정점 수만큼에서 끊는다.
  for (let guard = 0; cur !== null && guard <= parent.length; guard += 1) {
    out.push(cur);
    cur = parent[cur] ?? null;
  }
  return out.reverse();
}

export async function dijkstra(ctx: FacetContext<DijkstraData>): Promise<void> {
  const { vertexCount: n, edges, source } = ctx.data;

  // 인접 목록 둘 — 이웃 번호와 그 간선의 무게. 무방향이라 양쪽에 다 적는다.
  const adj: number[][] = Array.from({ length: n }, () => []);
  const wgt: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    if (ctx.cancelled) return;
    adj[e.a]!.push(e.b);
    wgt[e.a]!.push(e.w);
    adj[e.b]!.push(e.a);
    wgt[e.b]!.push(e.w);
  }

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const dist: number[] = Array.from({ length: n }, () => INF);
  const done: boolean[] = Array.from({ length: n }, () => false);
  const parent: (number | null)[] = Array.from({ length: n }, () => null);
  const order: number[] = [];

  dist[source] = 0;

  await phase('init');
  await ctx.emit({
    type: 'state-changed',
    target: 'graph',
    payload: {
      source,
      dist: dist.map(shown),
      settled: [...done],
      parent: [...parent],
    },
  });
  if (ctx.cancelled) return;

  for (let round = 0; round < n; round += 1) {
    if (ctx.cancelled) return;
    await phase('round-begin');
    await ctx.emit({ type: 'round-begin', payload: { round } });
    if (ctx.cancelled) return;

    let u = -1;
    let best = INF;

    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return;
      ctx.metric('scan-count', 'inc');
      const isNewBest = !done[i] && dist[i]! < best;

      await phase('scan');
      await ctx.emit({
        type: 'scan-step',
        target: `node:${i}`,
        payload: {
          node: i,
          settled: done[i] === true,
          dist: shown(dist[i]!),
          best: shown(best),
          bestNode: u < 0 ? null : u,
        },
      });
      if (ctx.cancelled) return;

      if (isNewBest) {
        best = dist[i]!;
        u = i;
        await phase('pick-min');
        await ctx.emit({ type: 'best-update', target: `node:${i}`, payload: { node: i, dist: best } });
        if (ctx.cancelled) return;
      }
    }

    // 고를 것이 있는가. 남은 것이 전부 무한대면 여기서 끝난다 — 이 그림은
    // 이어져 있어 걸리지 않지만, 판정 자체는 매 회 일어난다.
    await phase('stop-check');
    if (u < 0) break;
    await ctx.emit({ type: 'choose', target: `node:${u}`, payload: { node: u, dist: best } });
    if (ctx.cancelled) return;

    done[u] = true;
    order.push(u);
    ctx.metric('settle-count', 'inc');
    await phase('settle');
    await ctx.emit({
      type: 'settle',
      target: `node:${u}`,
      payload: { node: u, dist: best, order: order.length, path: pathTo(parent, u) },
    });
    if (ctx.cancelled) return;

    const neighbors = adj[u]!;
    const weights = wgt[u]!;
    for (let k = 0; k < neighbors.length; k += 1) {
      if (ctx.cancelled) return;
      const v = neighbors[k]!;
      const w = weights[k]!;
      const through = dist[u]! + w;
      const improved = through < dist[v]!;

      await phase('relax-check');
      await ctx.emit({
        type: 'relax-check',
        target: edgeId(u, v),
        payload: {
          from: u,
          to: v,
          weight: w,
          through,
          current: shown(dist[v]!),
          improved,
        },
      });
      if (ctx.cancelled) return;

      if (improved) {
        const before = shown(dist[v]!);
        dist[v] = through;
        parent[v] = u;
        ctx.metric('improve-count', 'inc');
        await phase('relax-apply');
        await ctx.emit({
          type: 'relax-apply',
          target: `node:${v}`,
          payload: { node: v, before, after: through, parent: u },
        });
        if (ctx.cancelled) return;
      }
    }
  }

  await phase('return-dist');
  await ctx.emit({ type: 'done', payload: { dist: [...dist], order: [...order] } });
}
