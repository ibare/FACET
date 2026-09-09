/**
 * 벨만-포드 — 음수 간선이 있어도 되는 최단 경로.
 *
 * 간선 전부를 정점 수보다 한 번 적게 되풀이해 편다. 한 바퀴가 돌 때마다 값이
 * 한 겹씩 더 깊이 스민다. 그리고 **마지막에 한 바퀴를 더** 돌아 아무것도 줄지
 * 않는지 본다 — 줄면 음수 고리가 있다는 뜻이다.
 *
 * ── 식별자 (C1)
 *
 *   node:<정점 번호>            정점
 *   edge:<꼬리>-<머리>          방향 간선. 같은 두 정점 사이에 양방향 간선이
 *                               있을 수 있으므로 순서가 뜻을 가진다
 *
 * ── 이벤트
 *
 * | type            | target        | payload                                                   | silent |
 * |-----------------|---------------|-----------------------------------------------------------|--------|
 * | `phase`         | —             | `{ phase: string }`                                       | true   |
 * | `dist-seeded`   | `node:<s>`    | `{ dist: (number\|null)[]; source: number }`               | false  |
 * | `pass-begin`    | —             | `{ pass: number; total: number }`                         | false  |
 * | `edge-inspect`  | `edge:<u>-<v>`| `{ edge, from, to, weight, distFrom, sum, distTo, improves }` | false |
 * | `edge-relax`    | `node:<v>`    | `{ edge, from, to, weight, before, after }`                | false  |
 * | `pass-end`      | —             | `{ pass; changed; dist: (number\|null)[] }` — `changed` 는 이 바퀴에 값이 줄어든 **정점 수** | false |
 * | `check-begin`   | —             | `{ pass: number }`                                        | false  |
 * | `check-end`     | —             | `{ changed: number }`                                     | false  |
 * | `done`          | —             | `{ dist: (number\|null)[]; relaxed: number; passes: number }` | false |
 *
 * `distFrom` / `distTo` / `sum` / `before` 는 아직 닿지 않은 정점이면 `null` 이다.
 * 무한대의 표기(∞)는 표현 계층이 정한다 — 알고리즘은 "값이 없다" 만 말한다 (C10).
 *
 * ── phase 어휘 (C3. `irs.ts` 와 글자까지 같아야 한다)
 *
 *   'setup' | 'pass' | 'inspect' | 'relax' | 'final-check' | 'done'
 *
 * ── 메트릭 (C5. `facet.ts` 의 metrics[] 와 같아야 한다)
 *
 *   pass-count     지나간 바퀴 (n-1 회. 마지막 검사 바퀴는 세지 않는다)
 *   relax-count    값이 실제로 줄어든 횟수
 *   compare-count  간선 하나를 견준 횟수 (검사 바퀴까지 포함)
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type BellmanFordEdge = {
  /** 꼬리 정점 번호. */
  from: number;
  /** 머리 정점 번호. */
  to: number;
  /** 간선 무게. 음수여도 된다. */
  weight: number;
};

export type BellmanFordData = {
  type: 'bellman-ford';
  /** 정점 수. 정점 번호는 0 부터 vertexCount-1. */
  vertexCount: number;
  /** 펴는 차례가 곧 이 배열의 차례다. 그 차례가 한 바퀴에 얼마나 스미는지를 정한다. */
  edges: BellmanFordEdge[];
  /** 출발 정점. */
  source: number;
};

/**
 * 아직 닿지 않음.
 *
 * `irs.ts` 의 `INF` 와 같은 값이다. 언어마다 무한대 표기가 갈리므로 32비트
 * 정수에 넉넉히 드는 큰 수 하나로 둔다. 화면에는 이 수가 아니라 `null` 로
 * 나간다 — 표기는 표현 계층의 일이다.
 */
const INF = 1000000000;

/** INF 를 "값 없음" 으로 바꿔 payload 에 싣는다. */
const reach = (d: number): number | null => (d === INF ? null : d);

export const bellmanFord = async (ctx: FacetContext<BellmanFordData>): Promise<void> => {
  const { vertexCount, edges, source } = ctx.data;
  const n = vertexCount;
  const m = edges.length;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const dist: number[] = new Array<number>(n).fill(INF);
  dist[source] = 0;

  const snapshot = (): (number | null)[] => dist.map(reach);

  await phase('setup');
  await ctx.emit({
    type: 'dist-seeded',
    target: `node:${source}`,
    payload: { dist: snapshot(), source },
  });
  if (ctx.cancelled) return;

  let relaxed = 0;

  // ── n-1 바퀴. 가장 긴 최단 경로도 간선 n-1 개를 넘지 않는다.
  for (let pass = 1; pass <= n - 1; pass++) {
    if (ctx.cancelled) return;
    await phase('pass');
    await ctx.emit({ type: 'pass-begin', payload: { pass, total: n - 1 } });
    if (ctx.cancelled) return;
    ctx.metric('pass-count', 'inc');

    // 이 바퀴에 값이 줄어든 **정점** 을 센다. 한 정점이 한 바퀴 안에서 두 번
    // 줄어들 수도 있으므로 (이 자료의 첫 바퀴에서 정점 1 과 3 이 그렇다) 횟수가
    // 아니라 집합의 크기가 "이 바퀴에 얼마나 스몄는가" 다. 화면의 원장에 물드는
    // 칸 수와도 그래야 맞는다.
    const soaked = new Set<number>();
    for (let e = 0; e < m; e++) {
      if (ctx.cancelled) return;
      const { from, to, weight } = edges[e];
      const improves = dist[from] !== INF && dist[from] + weight < dist[to];

      await phase('inspect');
      ctx.metric('compare-count', 'inc');
      await ctx.emit({
        type: 'edge-inspect',
        target: `edge:${from}-${to}`,
        payload: {
          edge: e,
          from,
          to,
          weight,
          distFrom: reach(dist[from]),
          sum: dist[from] === INF ? null : dist[from] + weight,
          distTo: reach(dist[to]),
          improves,
        },
      });
      if (ctx.cancelled) return;

      if (!improves) continue;

      const before = reach(dist[to]);
      dist[to] = dist[from] + weight;
      soaked.add(to);
      relaxed++;
      ctx.metric('relax-count', 'inc');

      await phase('relax');
      await ctx.emit({
        type: 'edge-relax',
        target: `node:${to}`,
        payload: { edge: e, from, to, weight, before, after: dist[to] },
      });
      if (ctx.cancelled) return;
    }

    await ctx.emit({
      type: 'pass-end',
      payload: { pass, changed: soaked.size, dist: snapshot() },
    });
    if (ctx.cancelled) return;
  }

  // ── 한 바퀴 더. 여기서도 줄어드는 간선이 있으면 음수 고리가 있다는 뜻이다.
  //    이 검사가 없으면 그냥 느린 완화 반복문이지 벨만-포드가 아니다.
  await phase('final-check');
  await ctx.emit({ type: 'check-begin', payload: { pass: n } });
  if (ctx.cancelled) return;

  let stillDropping = 0;
  for (let e = 0; e < m; e++) {
    if (ctx.cancelled) return;
    const { from, to, weight } = edges[e];
    const improves = dist[from] !== INF && dist[from] + weight < dist[to];
    if (improves) stillDropping++;

    await phase('final-check');
    ctx.metric('compare-count', 'inc');
    await ctx.emit({
      type: 'edge-inspect',
      target: `edge:${from}-${to}`,
      payload: {
        edge: e,
        from,
        to,
        weight,
        distFrom: reach(dist[from]),
        sum: dist[from] === INF ? null : dist[from] + weight,
        distTo: reach(dist[to]),
        improves,
      },
    });
    if (ctx.cancelled) return;
  }

  await ctx.emit({ type: 'check-end', payload: { changed: stillDropping } });
  if (ctx.cancelled) return;

  await phase('done');
  await ctx.emit({
    type: 'done',
    payload: { dist: snapshot(), relaxed, passes: n - 1 },
  });
};

/**
 * 재생과 무관하게 최종 거리표를 셈하는 순수 함수.
 *
 * 테스트가 화면에 뜨는 수를 실측할 때의 기준이며, 위 코루틴과 같은 규칙으로
 * 돈다 — 다만 여기서는 음수 고리 여부도 함께 낸다.
 */
export function computeBellmanFordResult(data: BellmanFordData): {
  dist: (number | null)[];
  negativeCycle: boolean;
  relaxed: number;
} {
  const dist = new Array<number>(data.vertexCount).fill(INF);
  dist[data.source] = 0;
  let relaxed = 0;

  for (let pass = 1; pass <= data.vertexCount - 1; pass++) {
    for (const { from, to, weight } of data.edges) {
      if (dist[from] !== INF && dist[from] + weight < dist[to]) {
        dist[to] = dist[from] + weight;
        relaxed++;
      }
    }
  }

  let negativeCycle = false;
  for (const { from, to, weight } of data.edges) {
    if (dist[from] !== INF && dist[from] + weight < dist[to]) negativeCycle = true;
  }

  return { dist: dist.map(reach), negativeCycle, relaxed };
}
