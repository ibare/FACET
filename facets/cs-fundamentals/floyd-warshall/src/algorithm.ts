/**
 * 플로이드-워셜 — 모든 쌍 최단 경로.
 *
 * 가운데로 세울 정점을 하나씩 바꿔 가며 모든 쌍의 거리를 고쳐 나간다. 가운데를
 * k 로 세우면 물음은 언제나 하나다 — "i 에서 k 를 거쳐 j 로 가면 더 짧은가".
 * 더 짧으면 표의 그 칸을 더 작은 수로 **갈아 끼운다.**
 *
 * ── 식별자
 *
 *   cell:<i>-<j>   표의 한 칸. i 에서 j 로 가는, 지금까지 알아낸 최단 거리.
 *   node:<k>       정점. 가운데 세운 정점을 가리킬 때 쓴다.
 *
 * ── 이벤트 (payload 스키마)
 *
 *   phase          silent · target 없음
 *                  { phase: string }
 *                  코드 패널의 줄 동기. 시각 변화 없음.
 *
 *   state-changed  target `cell:<i>-<j>`
 *                  { i: number, j: number, value: number, infinite: boolean }
 *                  칸에 값을 적는다. 표를 세우는 동안(무한·0)과 간선을 적어
 *                  넣을 때 쓴다. `infinite` 가 true 면 `value` 는 INF 이며
 *                  화면에는 수 대신 무한 기호가 선다.
 *
 *   mark           target `node:<k>`
 *                  { k: number }
 *                  이 정점을 가운데 세운다.
 *
 *   highlight      target [`cell:<i>-<j>`, `cell:<i>-<k>`, `cell:<k>-<j>`]
 *                  { i, j, k: number,
 *                    current: number, currentInfinite: boolean,
 *                    through: number, throughInfinite: boolean,
 *                    improves: boolean }
 *                  세 칸을 견준다. `through` 는 두 칸의 합이고,
 *                  `throughInfinite` 면 그 합은 뜻이 없다 (닿지 않는 길).
 *
 *   rewrite        target `cell:<i>-<j>`  (facet 고유)
 *                  { i, j, k: number, previous: number,
 *                    previousInfinite: boolean, value: number }
 *                  칸을 더 작은 수로 갈아 끼운다.
 *
 *   done           target 없음
 *                  { pivotCount: number, probeCount: number, rewriteCount: number }
 *
 * ── phase 어휘 (irs.ts 와 글자 단위로 같다 — C3)
 *
 *   'build-table' | 'add-edges' | 'pick-pivot' | 'probe' | 'rewrite' | 'done'
 *
 * ── 메트릭 (facet.ts 의 metrics 와 같다 — C5)
 *
 *   pivot-count · probe-count · rewrite-count
 *
 * ── 무한
 *
 * 큰 수 하나로 둔다 (`FLOYD_WARSHALL_INF`). 두 무한의 합이 32비트 정수 상한을
 * 넘지 않고 어떤 칸도 INF 보다 커질 수 없으므로, 더하기 전에 무한인지 묻는 줄이
 * 없어도 넘치지 않고 헛되이 갱신되지도 않는다. 까닭은 `irs.ts` 머리말과
 * `description.ts` 에 적었다.
 */

import type { FacetContext } from '@ffacet/core';

/**
 * 닿지 않는 자리에 두는 수.
 *
 * 두 개를 더해도 (2×10^9) 32비트 정수 상한(2,147,483,647)을 넘지 않는다.
 * 화면에는 이 수가 뜨지 않는다 — payload 의 `infinite` 가 true 로 서고
 * 무한 기호가 대신 선다.
 */
export const FLOYD_WARSHALL_INF = 1000000000;

export type FloydWarshallEdge = {
  /** 출발 정점의 자리 번호. */
  from: number;
  /** 도착 정점의 자리 번호. */
  to: number;
  weight: number;
};

export type FloydWarshallData = {
  type: 'floyd-warshall';
  /** 정점 이름. 자리 번호는 이 배열의 색인이다. */
  vertices: string[];
  /** 방향 간선. 같은 쌍이 두 번 나오면 뒤가 이긴다 (표에 덮어쓰므로). */
  edges: FloydWarshallEdge[];
};

/**
 * 표를 끝까지 셈한다 — 화면 없이.
 *
 * 재생 경로(`floydWarshallAlgorithm`)와 같은 셈을 하되 이벤트를 내지 않는다.
 * 검사가 세 갈래(이 함수 · 재생 · IR 인터프리터)를 맞대 보는 데 쓴다.
 * `computeResult` 로 등록하지는 않는다 — goal-preview 를 쓰지 않으므로.
 */
export function computeFloydWarshallTable(data: FloydWarshallData): number[][] {
  const n = data.vertices.length;
  const dist: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < n; j += 1) row.push(i === j ? 0 : FLOYD_WARSHALL_INF);
    dist.push(row);
  }
  for (const e of data.edges) dist[e.from][e.to] = e.weight;

  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        if (dist[i][k] + dist[k][j] < dist[i][j]) dist[i][j] = dist[i][k] + dist[k][j];
      }
    }
  }
  return dist;
}

export const floydWarshallAlgorithm = async (
  ctx: FacetContext<FloydWarshallData>,
): Promise<void> => {
  const { vertices, edges } = ctx.data;
  const n = vertices.length;
  const INF = FLOYD_WARSHALL_INF;

  /** phase 이름은 호출부에 리터럴로 선다 (C3). */
  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const dist: number[][] = [];
  for (let i = 0; i < n; i += 1) dist.push(new Array<number>(n).fill(INF));

  // ── 표를 세운다. 자기 자신까지는 0, 나머지는 무한.
  await phase('build-table');
  for (let i = 0; i < n; i += 1) {
    if (ctx.cancelled) return;
    for (let j = 0; j < n; j += 1) {
      if (ctx.cancelled) return;
      const value = i === j ? 0 : INF;
      dist[i][j] = value;
      await ctx.emit({
        type: 'state-changed',
        target: `cell:${i}-${j}`,
        payload: { i, j, value, infinite: i !== j },
      });
    }
  }

  // ── 직접 잇는 간선을 적어 넣는다.
  await phase('add-edges');
  for (const e of edges) {
    if (ctx.cancelled) return;
    dist[e.from][e.to] = e.weight;
    await ctx.emit({
      type: 'state-changed',
      target: `cell:${e.from}-${e.to}`,
      payload: { i: e.from, j: e.to, value: e.weight, infinite: false },
    });
  }

  let pivotCount = 0;
  let probeCount = 0;
  let rewriteCount = 0;

  for (let k = 0; k < n; k += 1) {
    if (ctx.cancelled) return;

    // ── 가운데 세울 정점을 바꾼다.
    await phase('pick-pivot');
    pivotCount += 1;
    ctx.metric('pivot-count', 'inc');
    await ctx.emit({ type: 'mark', target: `node:${k}`, payload: { k } });

    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return;
      for (let j = 0; j < n; j += 1) {
        if (ctx.cancelled) return;
        // 자기 자신까지는 늘 0 이고 음수 무게가 없으므로 물을 것이 없다.
        if (i === j) continue;

        // ── 가운데를 거치면 더 짧은가.
        await phase('probe');
        const current = dist[i][j];
        const throughSum = dist[i][k] + dist[k][j];
        const improves = throughSum < current;
        probeCount += 1;
        ctx.metric('probe-count', 'inc');
        await ctx.emit({
          type: 'highlight',
          target: [`cell:${i}-${j}`, `cell:${i}-${k}`, `cell:${k}-${j}`],
          payload: {
            i,
            j,
            k,
            current,
            currentInfinite: current >= INF,
            through: throughSum,
            throughInfinite: dist[i][k] >= INF || dist[k][j] >= INF,
            improves,
          },
        });
        if (!improves) continue;

        // ── 더 짧다. 칸을 갈아 끼운다.
        await phase('rewrite');
        dist[i][j] = throughSum;
        rewriteCount += 1;
        ctx.metric('rewrite-count', 'inc');
        await ctx.emit({
          type: 'rewrite',
          target: `cell:${i}-${j}`,
          payload: {
            i,
            j,
            k,
            previous: current,
            previousInfinite: current >= INF,
            value: throughSum,
          },
        });
      }
    }
  }

  if (ctx.cancelled) return;
  await phase('done');
  await ctx.emit({ type: 'done', payload: { pivotCount, probeCount, rewriteCount } });
};
