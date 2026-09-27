/**
 * bipartite-coloring — 두 색으로 칠해지는 그래프를 색대로 가르면 간선은 어디에 놓이는가.
 *
 * 다 지어진 무향 그래프에서 출발 정점으로부터의 거리(가장 짧은 길의 간선 수)를
 * 너비 우선으로 셈하고, 거리 한 겹씩 홀짝에 따라 색 0 · 1 을 칠한다. 모두 칠하면
 * 같은 색끼리 한 편으로 모아 건너는 간선과 한 편 안의 간선을 센다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   paint-layer  { depth: number; color: 0 | 1;
 *                  layer: { v: number; from: number[] }[];   // from = 거리 depth−1 의 이웃 (작은 번호부터)
 *                  painted: number;                          // 이 겹까지 칠한 정점 수
 *                  sameColor: number }                       // 칠한 정점끼리 잇는 간선 중 두 끝이 같은 색인 것
 *   split        { sides: [number[], number[]];               // 색 0 의 편 · 색 1 의 편 (작은 번호부터)
 *                  crossing: number;                          // 두 편 사이를 건너는 간선 수
 *                  inside: number }                           // 한 편 안에 머무는 간선 수
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 그래프(칠하지 않음)로 세운다 — init 이벤트 없음.
 * 같은 색 끝 간선이 0 이 아니면(홀수 순환) 던진다. 닿지 않는 정점이 있어도 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Edge = readonly [number, number];

export type BipartiteColoringFacetData = {
  type: 'bipartite-coloring';
  vertices: number[];
  edges: Edge[];
  start: number;
  stepMs: number;
};

export type Color = 0 | 1;

export type LayerEntry = { v: number; from: number[] };

export type Layer = { depth: number; color: Color; entries: LayerEntry[] };

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. */
export function narrowBipartiteColoringData(raw: unknown): BipartiteColoringFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('bipartite-coloring: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'bipartite-coloring') {
    throw new Error(`bipartite-coloring: initialData.type 이 'bipartite-coloring' 이 아니다 (${String(r.type)})`);
  }
  if (!Array.isArray(r.vertices) || r.vertices.length === 0) {
    throw new Error('bipartite-coloring: initialData.vertices 가 비었거나 배열이 아니다');
  }
  const vertices: number[] = [];
  r.vertices.forEach((v, i) => {
    if (!isInt(v)) throw new Error(`bipartite-coloring: initialData.vertices[${i}] 가 정수가 아니다`);
    if (vertices.includes(v)) throw new Error(`bipartite-coloring: initialData.vertices[${i}] = ${v} 가 겹친다`);
    vertices.push(v);
  });
  if (!Array.isArray(r.edges)) {
    throw new Error('bipartite-coloring: initialData.edges 가 배열이 아니다');
  }
  const edges: Edge[] = [];
  r.edges.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 2 || !isInt(e[0]) || !isInt(e[1])) {
      throw new Error(`bipartite-coloring: initialData.edges[${i}] 가 정수 둘이 아니다`);
    }
    const a = e[0];
    const b = e[1];
    if (!vertices.includes(a) || !vertices.includes(b)) {
      throw new Error(`bipartite-coloring: initialData.edges[${i}] 의 끝 (${a}, ${b}) 이 정점 목록에 없다`);
    }
    if (a === b) throw new Error(`bipartite-coloring: initialData.edges[${i}] 가 제 자신으로 돈다`);
    if (edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
      throw new Error(`bipartite-coloring: initialData.edges[${i}] 가 겹친다`);
    }
    edges.push([a, b]);
  });
  if (!isInt(r.start) || !vertices.includes(r.start)) {
    throw new Error('bipartite-coloring: initialData.start 가 정점 목록에 없다');
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) {
    throw new Error('bipartite-coloring: initialData.stepMs 가 양수가 아니다');
  }
  return {
    type: 'bipartite-coloring',
    vertices,
    edges,
    start: r.start,
    stepMs: r.stepMs,
  };
}

/** 이웃 목록 — 작은 번호부터. */
function neighbors(data: BipartiteColoringFacetData, v: number): number[] {
  const out: number[] = [];
  for (const [a, b] of data.edges) {
    if (a === v) out.push(b);
    else if (b === v) out.push(a);
  }
  return out.sort((x, y) => x - y);
}

/** 너비 우선으로 거리 겹을 셈한다. 닿지 않는 정점이 있으면 던진다. */
export function distanceLayers(data: BipartiteColoringFacetData): Layer[] {
  const dist = new Map<number, number>([[data.start, 0]]);
  const queue: number[] = [data.start];
  for (let head = 0; head < queue.length; head += 1) {
    const u = queue[head] as number;
    const du = dist.get(u) as number;
    for (const w of neighbors(data, u)) {
      if (!dist.has(w)) {
        dist.set(w, du + 1);
        queue.push(w);
      }
    }
  }
  const unreached = data.vertices.filter((v) => !dist.has(v));
  if (unreached.length > 0) {
    throw new Error(`bipartite-coloring: 출발 정점 ${data.start} 에서 닿지 않는 정점 ${unreached.join(', ')}`);
  }
  const layers: Layer[] = [];
  for (const v of [...data.vertices].sort((x, y) => x - y)) {
    const d = dist.get(v) as number;
    while (layers.length <= d) {
      const depth = layers.length;
      layers.push({ depth, color: depth % 2 === 0 ? 0 : 1, entries: [] });
    }
    const from = neighbors(data, v).filter((w) => dist.get(w) === d - 1);
    (layers[d] as Layer).entries.push({ v, from });
  }
  return layers;
}

/** 집합 표기 — `{1, 3, 5}`, 비면 `∅`. */
export function formatSet(xs: readonly number[]): string {
  if (xs.length === 0) return '∅';
  return `{${[...xs].sort((a, b) => a - b).join(', ')}}`;
}

export async function bipartiteColoring(
  ctx0: FacetContext<BipartiteColoringFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<BipartiteColoringFacetData>;
  const data = narrowBipartiteColoringData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const layers = distanceLayers(data);
  const color = new Map<number, Color>();
  let painted = 0;

  // 걸음 0 은 칠하지 않은 그래프가 이미 서 있다 — 읽을 틈을 두고 첫 겹을 칠한다.
  for (const layer of layers) {
    if (!(await pause())) return;
    for (const e of layer.entries) color.set(e.v, layer.color);
    painted += layer.entries.length;
    let sameColor = 0;
    for (const [a, b] of data.edges) {
      const ca = color.get(a);
      const cb = color.get(b);
      if (ca !== undefined && cb !== undefined && ca === cb) sameColor += 1;
    }
    if (sameColor !== 0) {
      throw new Error(`bipartite-coloring: 거리 ${layer.depth} 를 칠하자 두 끝이 같은 색인 간선 ${sameColor} — 두 색으로 칠해지지 않는다`);
    }
    await ctx.emit({
      type: 'paint-layer',
      payload: {
        depth: layer.depth,
        color: layer.color,
        layer: layer.entries.map((e) => ({ v: e.v, from: [...e.from] })),
        painted,
        sameColor,
      },
    });
  }

  if (!(await pause())) return;
  const side0 = data.vertices.filter((v) => color.get(v) === 0).sort((a, b) => a - b);
  const side1 = data.vertices.filter((v) => color.get(v) === 1).sort((a, b) => a - b);
  let crossing = 0;
  let inside = 0;
  for (const [a, b] of data.edges) {
    if (color.get(a) === color.get(b)) inside += 1;
    else crossing += 1;
  }
  await ctx.emit({
    type: 'split',
    payload: { sides: [side0, side1], crossing, inside },
  });
}
