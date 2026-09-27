/**
 * bipartite-coloring 장면.
 *
 * 바탕  — 정점 · 간선 · 출발 정점 (initialData 에서 베낀다)
 * 자취  — 칠한 정점과 그 색 · 거리 (칠한 차례대로), 갈라선 두 편과 센 간선
 * 이번 걸음 — 어느 겹을 칠했는가 / 갈라섰는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowBipartiteColoringData, type Color, type Edge, type LayerEntry } from './algorithm.js';

export type PaintedVertex = { v: number; color: Color; depth: number };

export type SplitResult = {
  sides: [number[], number[]];
  crossing: number;
  inside: number;
};

export type BipartiteStep =
  | {
      kind: 'paint';
      depth: number;
      color: Color;
      layer: LayerEntry[];
      painted: number;
      sameColor: number;
    }
  | { kind: 'split' };

export type BipartiteColoringScene = {
  vertices: number[];
  edges: Edge[];
  start: number;
  painted: PaintedVertex[];
  split: SplitResult | null;
  step: BipartiteStep | null;
};

function fail(msg: string): never {
  throw new Error(`bipartite-coloring 장면: ${msg}`);
}

function readInt(obj: Record<string, unknown>, key: string, path: string): number {
  const x = obj[key];
  if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${path}.${key} 가 정수가 아니다`);
  return x;
}

function readIntArray(x: unknown, path: string): number[] {
  if (!Array.isArray(x)) fail(`${path} 가 배열이 아니다`);
  return x.map((y, i) => {
    if (typeof y !== 'number' || !Number.isInteger(y)) fail(`${path}[${i}] 가 정수가 아니다`);
    return y;
  });
}

function readColor(obj: Record<string, unknown>, path: string): Color {
  const c = obj.color;
  if (c !== 0 && c !== 1) fail(`${path}.color 가 0 · 1 이 아니다`);
  return c;
}

function reducePaint(scene: BipartiteColoringScene, payload: unknown): BipartiteColoringScene {
  if (typeof payload !== 'object' || payload === null) fail('paint-layer.payload 가 객체가 아니다');
  const p = payload as Record<string, unknown>;
  const depth = readInt(p, 'depth', 'paint-layer.payload');
  const color = readColor(p, 'paint-layer.payload');
  const painted = readInt(p, 'painted', 'paint-layer.payload');
  const sameColor = readInt(p, 'sameColor', 'paint-layer.payload');
  if (scene.split !== null) fail('갈라선 뒤에 paint-layer 가 왔다');
  const last = scene.painted[scene.painted.length - 1];
  const expectDepth = last === undefined ? 0 : last.depth + 1;
  if (depth !== expectDepth) fail(`paint-layer.payload.depth ${depth} — 기대한 겹은 ${expectDepth}`);
  if (!Array.isArray(p.layer) || p.layer.length === 0) fail('paint-layer.payload.layer 가 비었거나 배열이 아니다');
  const done = new Set(scene.painted.map((x) => x.v));
  const layer: LayerEntry[] = p.layer.map((raw, i) => {
    const path = `paint-layer.payload.layer[${i}]`;
    if (typeof raw !== 'object' || raw === null) fail(`${path} 가 객체가 아니다`);
    const e = raw as Record<string, unknown>;
    const v = readInt(e, 'v', path);
    if (!scene.vertices.includes(v)) fail(`${path}.v ${v} 가 바탕에 없다`);
    if (done.has(v)) fail(`${path}.v ${v} 는 이미 칠했다`);
    const from = readIntArray(e.from, `${path}.from`);
    if (depth === 0) {
      if (v !== scene.start) fail(`${path}.v ${v} 가 출발 정점 ${scene.start} 이 아니다`);
      if (from.length !== 0) fail(`${path}.from — 거리 0 에는 앞 겹이 없다`);
    } else if (from.length === 0) {
      fail(`${path}.from 이 비었다`);
    }
    for (const w of from) {
      const pw = scene.painted.find((x) => x.v === w);
      if (pw === undefined || pw.depth !== depth - 1) fail(`${path}.from ${w} 가 앞 겹에 칠한 정점이 아니다`);
      if (!scene.edges.some(([a, b]) => (a === v && b === w) || (a === w && b === v))) {
        fail(`${path}.from ${w}–${v} 간선이 바탕에 없다`);
      }
    }
    return { v, from };
  });
  const nextPainted = [...scene.painted, ...layer.map((e) => ({ v: e.v, color, depth }))];
  if (nextPainted.length !== painted) fail(`paint-layer.payload.painted ${painted} 가 칠한 정점 수 ${nextPainted.length} 와 다르다`);
  return {
    ...scene,
    painted: nextPainted,
    step: { kind: 'paint', depth, color, layer, painted, sameColor },
  };
}

function reduceSplit(scene: BipartiteColoringScene, payload: unknown): BipartiteColoringScene {
  if (typeof payload !== 'object' || payload === null) fail('split.payload 가 객체가 아니다');
  const p = payload as Record<string, unknown>;
  if (scene.split !== null) fail('split 이 두 번 왔다');
  if (scene.painted.length !== scene.vertices.length) fail('칠하지 않은 정점이 남았는데 split 이 왔다');
  if (!Array.isArray(p.sides) || p.sides.length !== 2) fail('split.payload.sides 가 둘이 아니다');
  const side0 = readIntArray(p.sides[0], 'split.payload.sides[0]');
  const side1 = readIntArray(p.sides[1], 'split.payload.sides[1]');
  const colorOf = (v: number, path: string): Color => {
    const pv = scene.painted.find((x) => x.v === v);
    if (pv === undefined) fail(`${path} ${v} 가 칠한 정점이 아니다`);
    return pv.color;
  };
  side0.forEach((v, i) => {
    if (colorOf(v, `split.payload.sides[0][${i}]`) !== 0) fail(`split.payload.sides[0][${i}] ${v} 의 색이 0 이 아니다`);
  });
  side1.forEach((v, i) => {
    if (colorOf(v, `split.payload.sides[1][${i}]`) !== 1) fail(`split.payload.sides[1][${i}] ${v} 의 색이 1 이 아니다`);
  });
  if (side0.length + side1.length !== scene.vertices.length) fail('split.payload.sides 가 정점을 다 담지 않는다');
  const crossing = readInt(p, 'crossing', 'split.payload');
  const inside = readInt(p, 'inside', 'split.payload');
  if (crossing + inside !== scene.edges.length) fail(`split.payload 의 crossing + inside 가 간선 수 ${scene.edges.length} 와 다르다`);
  return {
    ...scene,
    split: { sides: [side0, side1], crossing, inside },
    step: { kind: 'split' },
  };
}

export const bipartiteColoringScene: ScenePlan<BipartiteColoringScene> = {
  initial(initialData: unknown): BipartiteColoringScene {
    const data = narrowBipartiteColoringData(initialData);
    return {
      vertices: [...data.vertices],
      edges: data.edges.map(([a, b]) => [a, b] as const),
      start: data.start,
      painted: [],
      split: null,
      step: null,
    };
  },
  reduce(scene: BipartiteColoringScene, event: FacetRuntimeEvent): BipartiteColoringScene {
    switch (event.type) {
      case 'paint-layer':
        return reducePaint(scene, event.payload);
      case 'split':
        return reduceSplit(scene, event.payload);
      default:
        throw new Error(`bipartite-coloring 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
