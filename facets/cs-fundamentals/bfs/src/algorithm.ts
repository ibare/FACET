/**
 * BFS (너비 우선 탐색) 알고리즘 — 출발점으로부터 같은 거리에 있는 정점들을
 * 한 덩어리(레이어)로 묶어 바깥쪽으로 한 층씩 동시에 확장한다.
 *
 * 식별자:
 *   - 노드: `node:<id>`
 *   - 엣지: `edge:<a>-<b>` (a < b 로 정규화된 무방향 키)
 *
 * 이벤트:
 *   - phase (kind: 'dequeue-node' | 'scan-neighbors' | 'discover-layer' | 'layer-complete', silent)
 *   - enqueue   target: node:<id>   payload: { id, distance, label }
 *   - dequeue   target: node:<id>   payload: { id, distance }
 *   - highlight target: edge:<key>  payload: { kind: 'scan', from, to }
 *   - layer-discovered               — 집합 이벤트 (한 프레임 동시 점등)
 *       target: string[]  — ['node:<id>', ...]  같은 레이어 노드 전체
 *       payload: { distance: number, nodes: string[] }
 *   - mark       target: node:<id>  payload: { kind: 'source' | 'visited', distance? }
 *   - done
 *
 * 메트릭: 'visited-count', 'layer-count', 'edge-scan-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type BfsGraphData = {
  type: 'graph';
  nodes: { id: string }[];
  /** 무방향 단순 그래프 — 각 간선은 양쪽 모두에 기재. */
  adjacency: Record<string, string[]>;
  /** 출발 정점 id. */
  source: string;
};

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export async function bfs(ctx: FacetContext<BfsGraphData>): Promise<void> {
  const { nodes, adjacency, source } = ctx.data;
  if (nodes.length === 0) {
    await ctx.emit({ type: 'done' });
    return;
  }
  // 출발점이 노드 목록에 없으면 오류.
  if (!nodes.some((n) => n.id === source)) {
    throw new Error(`BFS 출발점이 노드 목록에 없음: "${source}"`);
  }

  const visited = new Set<string>([source]);
  const distance = new Map<string, number>();
  distance.set(source, 0);

  // 0. 출발점 마킹 + 0-레이어 동시 발견 이벤트 + 큐 블록 입장.
  await ctx.emit({
    type: 'mark',
    target: `node:${source}`,
    payload: { kind: 'source' },
  });
  await ctx.emit({
    type: 'phase',
    payload: { phase: 'discover-layer' },
    silent: true,
  });
  await ctx.emit({
    type: 'layer-discovered',
    target: [`node:${source}`],
    payload: { distance: 0, nodes: [source] },
  });
  await ctx.emit({
    type: 'enqueue',
    target: `node:${source}`,
    payload: { id: source, distance: 0, label: source },
  });
  ctx.metric('visited-count', 'inc');
  ctx.metric('layer-count', 'inc');

  let currentFront: string[] = [source];
  let k = 0;

  while (currentFront.length > 0) {
    if (ctx.cancelled) return;

    const discoveredThisLayer: string[] = [];
    const seenThisLayer = new Set<string>();

    // 현재 레이어 전원의 dequeue + 이웃 탐사.
    for (const node of currentFront) {
      if (ctx.cancelled) return;

      await ctx.emit({
        type: 'phase',
        payload: { phase: 'dequeue-node' },
        silent: true,
      });
      await ctx.emit({
        type: 'dequeue',
        target: `node:${node}`,
        payload: { id: node, distance: k },
      });

      const neighbors = adjacency[node] ?? [];
      for (const nb of neighbors) {
        if (ctx.cancelled) return;

        await ctx.emit({
          type: 'phase',
          payload: { phase: 'scan-neighbors' },
          silent: true,
        });
        await ctx.emit({
          type: 'highlight',
          target: `edge:${edgeKey(node, nb)}`,
          payload: { kind: 'scan', from: node, to: nb },
        });
        ctx.metric('edge-scan-count', 'inc');

        if (!visited.has(nb) && !seenThisLayer.has(nb)) {
          seenThisLayer.add(nb);
          discoveredThisLayer.push(nb);
        }
      }
    }

    // 레이어 발견 — 한 이벤트로 묶어 동시 점등.
    if (discoveredThisLayer.length === 0) {
      await ctx.emit({
        type: 'phase',
        payload: { phase: 'layer-complete' },
        silent: true,
      });
      break;
    }

    k += 1;
    for (const id of discoveredThisLayer) {
      visited.add(id);
      distance.set(id, k);
      ctx.metric('visited-count', 'inc');
    }

    await ctx.emit({
      type: 'phase',
      payload: { phase: 'discover-layer' },
      silent: true,
    });
    await ctx.emit({
      type: 'layer-discovered',
      target: discoveredThisLayer.map((id) => `node:${id}`),
      payload: { distance: k, nodes: [...discoveredThisLayer] },
    });

    // 레이어 block 이 큐 뒤쪽으로 입장. 같은 tint 를 유지하므로 사용자에게는
    // "한 묶음" 으로 보인다.
    for (const id of discoveredThisLayer) {
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'enqueue',
        target: `node:${id}`,
        payload: { id, distance: k, label: id },
      });
    }

    await ctx.emit({
      type: 'phase',
      payload: { phase: 'layer-complete' },
      silent: true,
    });
    ctx.metric('layer-count', 'inc');
    currentFront = discoveredThisLayer;
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}

/**
 * 알고리즘 실행과 별개로 "모든 도달 가능 노드의 최단 거리 맵" 을 즉시 계산.
 * 테스트와 (향후) 요약 패널이 참조.
 */
export function computeBfsResult(initialData: BfsGraphData): {
  type: 'graph-bfs-result';
  distance: Record<string, number>;
  layers: string[][];
} {
  const { nodes, adjacency, source } = initialData;
  const distance: Record<string, number> = {};
  const layers: string[][] = [];
  if (!nodes.some((n) => n.id === source)) {
    return { type: 'graph-bfs-result', distance, layers };
  }
  const visited = new Set<string>([source]);
  distance[source] = 0;
  let front: string[] = [source];
  layers.push([source]);
  let k = 0;
  while (front.length > 0) {
    const next: string[] = [];
    for (const node of front) {
      const neighbors = adjacency[node] ?? [];
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          distance[nb] = k + 1;
          next.push(nb);
        }
      }
    }
    if (next.length === 0) break;
    k += 1;
    layers.push(next);
    front = next;
  }
  return { type: 'graph-bfs-result', distance, layers };
}
