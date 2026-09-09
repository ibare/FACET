/**
 * 깊이 우선 탐색 — 한 갈래를 끝까지 파고들었다가, 막히면 되짚어 나와 다음 갈래로 든다.
 *
 * 알고리즘 자체가 재귀다. `visit` 이 자기를 부르고, 그 부름이 끝나 돌아오는 것이
 * 곧 "물러남" 이다. 부르는 일과 돌아오는 일은 서로 다른 사건이므로 서로 다른
 * 이벤트로 낸다 (`descend` / `ascend`).
 *
 * ── 식별자 (C1)
 *
 *   `node:<n>`   정점. n 은 0 부터의 번호.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type           | silent | payload                                              |
 * | -------------- | ------ | ---------------------------------------------------- |
 * | `mark`         | 아니오 | `{ node, parent, depth, seq }`                        |
 * | `scan`         | 아니오 | `{ node, index, total, neighbor }`                    |
 * | `edge-open`    | 아니오 | `{ from, to }`                                        |
 * | `edge-skipped` | 아니오 | `{ from, to }`                                        |
 * | `descend`      | 아니오 | `{ from, to, depth }`                                 |
 * | `ascend`       | 아니오 | `{ node, parent, depth }`                             |
 * | `done`         | 아니오 | `{ order, count, depth, skipped }`                    |
 * | `phase`        | 예     | `{ phase }`                                           |
 *
 * `mark` 만 표준 어휘다 — 뜻 그대로 "이 정점을 본 자리로 표시한다" 이고
 * `target: 'node:<n>'` 을 함께 싣는다. 나머지 다섯은 이 facet 고유 확장이다.
 * `descend` 와 `ascend` 를 하나의 `state-changed` 로 묶지 않은 것은 이 알고리즘의
 * 전부가 그 둘의 구별이기 때문이다.
 *
 * `parent` 는 자기를 부른 정점이며 첫 부름에서는 `null` 이다. `depth` 는 호출
 * 스택에 쌓인 프레임 수로 첫 부름이 1 이다.
 *
 * ── phase 어휘 (C3) — `irs.ts` 와 글자 단위로 같다
 *
 *   'mark' | 'scan' | 'check' | 'descend' | 'ascend'
 *
 * ── 메트릭 (C5) — `facet.ts` 의 metrics[] 와 이름이 같다
 *
 *   'visit-count'  본 정점 수
 *   'skip-count'   이미 본 자리라 들어가지 않은 간선 수
 *   'max-depth'    호출 스택이 가장 깊었던 높이 (새 기록이 날 때마다 1 씩 는다)
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type DfsData = {
  type: string;
  /** 이웃 목록. `adjacency[v]` 를 적힌 차례대로 본다. */
  adjacency: number[][];
  /** 첫 부름이 들어가는 정점. */
  start: number;
};

export async function dfs(ctx: FacetContext<DfsData>): Promise<void> {
  const adjacency = ctx.data.adjacency;
  const vertexCount = adjacency.length;
  const start = ctx.data.start;

  const visited = new Array<boolean>(vertexCount).fill(false);
  /** 본 차례대로 쌓인 정점 번호. 화면의 방문 차례 띠가 이것을 그린다. */
  const order: number[] = [];
  let deepest = 0;
  let skipped = 0;

  /**
   * phase 발신 헬퍼. 호출부가 전부 `phase('mark')` 꼴이라 이름이 grep 으로
   * 잡힌다 (C3 가 허용하는 형태).
   */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * IR 의 `dfs(adj, visited, node)` 와 같은 몸이다. 한 줄 한 줄이 코드 패널의
   * 한 줄과 맞물리도록 순서를 그대로 지킨다.
   */
  async function visit(node: number, parent: number | null, depth: number): Promise<void> {
    // visited[node] = 1
    await phase('mark');
    visited[node] = true;
    order.push(node);
    ctx.metric('visit-count', 'inc');
    if (depth > deepest) {
      deepest = depth;
      // 누적 메트릭이라 최댓값을 직접 넣을 수 없다. 새 기록이 날 때만 1 씩
      // 올리면 합계가 곧 가장 깊었던 높이다.
      ctx.metric('max-depth', 1);
    }
    await ctx.emit({
      type: 'mark',
      target: `node:${node}`,
      payload: { node, parent, depth, seq: order.length },
    });

    const neighbors = adjacency[node] ?? [];
    // for i in range(len(adj[node]))
    for (let i = 0; i < neighbors.length; i++) {
      if (ctx.cancelled) return;
      // nb = adj[node][i]
      const nb = neighbors[i]!;
      await phase('scan');
      await ctx.emit({
        type: 'scan',
        payload: { node, index: i, total: neighbors.length, neighbor: nb },
      });

      // if visited[nb] == 0
      await phase('check');
      if (visited[nb]) {
        skipped += 1;
        ctx.metric('skip-count', 'inc');
        await ctx.emit({ type: 'edge-skipped', payload: { from: node, to: nb } });
        continue;
      }
      await ctx.emit({ type: 'edge-open', payload: { from: node, to: nb } });

      // dfs(adj, visited, nb) — 이 한 줄 안에서 아래 갈래가 통째로 다녀온다.
      await phase('descend');
      await ctx.emit({ type: 'descend', payload: { from: node, to: nb, depth: depth + 1 } });
      await visit(nb, node, depth + 1);
      if (ctx.cancelled) return;
    }

    // return — 없어도 도는 줄이지만, 돌아오는 일에 짚을 자리가 여기다 (irs.ts).
    await phase('ascend');
    await ctx.emit({ type: 'ascend', payload: { node, parent, depth } });
  }

  if (vertexCount === 0) {
    await ctx.emit({ type: 'done', payload: { order: [], count: 0, depth: 0, skipped: 0 } });
    return;
  }

  await visit(start, null, 1);
  if (ctx.cancelled) return;

  await ctx.emit({
    type: 'done',
    payload: { order: [...order], count: order.length, depth: deepest, skipped },
  });
}
