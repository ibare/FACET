/**
 * determinant-area 장면.
 *
 * 바탕(base)   — init 이 한 번 정한다: 행렬 네 칸 · 도형과 넓이 · 그림 범위.
 * 자취(moved · det) — 걸음이 쌓는다: 옮긴 도형의 새 꼭짓점 · 넓이 · 배수, 셈한 ad − bc.
 * 이번 걸음(step) — 지금 무엇이 움직였는가.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowDeterminantAreaData, type Pt } from './algorithm.js';

export type BaseShape = { id: string; pts: Pt[]; area: number };

export type Base = {
  a: number;
  b: number;
  c: number;
  d: number;
  shapes: BaseShape[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  maxArea: number;
};

export type Moved = { to: Pt[]; before: number; after: number; ratio: number };

export type DetResult = { det: number; matches: string[] };

export type Step = { kind: 'start' } | { kind: 'move'; id: string } | { kind: 'det' };

export type DeterminantAreaScene = {
  base: Base | null;
  /** 도형 id → 옮긴 결과. 옮긴 차례를 지키려고 배열로 둔다. */
  moved: { id: string; result: Moved }[];
  det: DetResult | null;
  step: Step;
};

function rec(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`${path}: 객체가 아니다`);
  return x as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${path}.${key}: 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${path}.${key}: 글자가 아니다`);
  return v;
}

function pts(x: unknown, path: string): Pt[] {
  if (!Array.isArray(x)) throw new Error(`${path}: 배열이 아니다`);
  return x.map((p: unknown, i: number) => {
    if (!Array.isArray(p) || p.length !== 2) throw new Error(`${path}[${i}]: [x, y] 가 아니다`);
    const [px, py] = p as unknown[];
    if (typeof px !== 'number' || typeof py !== 'number' || !Number.isFinite(px) || !Number.isFinite(py)) {
      throw new Error(`${path}[${i}]: 좌표가 수가 아니다`);
    }
    return [px, py] as Pt;
  });
}

function readBase(payload: unknown): Base {
  const o = rec(payload, 'init.payload');
  const shapesRaw = o.shapes;
  if (!Array.isArray(shapesRaw) || shapesRaw.length === 0) throw new Error('init.payload.shapes: 비었다');
  const shapes = shapesRaw.map((s: unknown, i: number) => {
    const so = rec(s, `init.payload.shapes[${i}]`);
    return {
      id: str(so, 'id', `init.payload.shapes[${i}]`),
      pts: pts(so.pts, `init.payload.shapes[${i}].pts`),
      area: num(so, 'area', `init.payload.shapes[${i}]`),
    };
  });
  const bo = rec(o.bounds, 'init.payload.bounds');
  return {
    a: num(o, 'a', 'init.payload'),
    b: num(o, 'b', 'init.payload'),
    c: num(o, 'c', 'init.payload'),
    d: num(o, 'd', 'init.payload'),
    shapes,
    bounds: {
      minX: num(bo, 'minX', 'init.payload.bounds'),
      maxX: num(bo, 'maxX', 'init.payload.bounds'),
      minY: num(bo, 'minY', 'init.payload.bounds'),
      maxY: num(bo, 'maxY', 'init.payload.bounds'),
    },
    maxArea: num(o, 'maxArea', 'init.payload'),
  };
}

export const determinantAreaScene: ScenePlan<DeterminantAreaScene> = {
  initial(initialData: unknown): DeterminantAreaScene {
    // 모양만 확인한다. 넓이 · 범위는 알고리즘이 셈하므로 silent init 이 바탕을 채운다.
    narrowDeterminantAreaData(initialData);
    return { base: null, moved: [], det: null, step: { kind: 'start' } };
  },

  reduce(scene: DeterminantAreaScene, event: FacetRuntimeEvent): DeterminantAreaScene {
    switch (event.type) {
      case 'init': {
        return { base: readBase(event.payload), moved: [], det: null, step: { kind: 'start' } };
      }
      case 'move': {
        const base = scene.base;
        if (base === null) throw new Error('move: 바탕(init) 앞에 왔다');
        const o = rec(event.payload, 'move.payload');
        const id = str(o, 'id', 'move.payload');
        const shape = base.shapes.find((s) => s.id === id);
        if (shape === undefined) throw new Error(`move.payload.id: 바탕에 없는 도형 ${id}`);
        if (scene.moved.some((m) => m.id === id)) throw new Error(`move.payload.id: 이미 옮긴 도형 ${id}`);
        const to = pts(o.to, 'move.payload.to');
        if (to.length !== shape.pts.length) throw new Error(`move.payload.to: 꼭짓점 수가 ${shape.pts.length} 이 아니다`);
        const before = num(o, 'before', 'move.payload');
        if (before !== shape.area) throw new Error(`move.payload.before: 바탕 넓이 ${shape.area} 와 다르다 (${before})`);
        const result: Moved = {
          to,
          before,
          after: num(o, 'after', 'move.payload'),
          ratio: num(o, 'ratio', 'move.payload'),
        };
        return {
          base,
          moved: [...scene.moved, { id, result }],
          det: scene.det,
          step: { kind: 'move', id },
        };
      }
      case 'det': {
        const base = scene.base;
        if (base === null) throw new Error('det: 바탕(init) 앞에 왔다');
        const o = rec(event.payload, 'det.payload');
        for (const k of ['a', 'b', 'c', 'd'] as const) {
          if (num(o, k, 'det.payload') !== base[k]) throw new Error(`det.payload.${k}: 바탕 행렬과 다르다`);
        }
        const m = o.matches;
        if (!Array.isArray(m)) throw new Error('det.payload.matches: 배열이 아니다');
        const matches = m.map((x: unknown, i: number) => {
          if (typeof x !== 'string' || !base.shapes.some((s) => s.id === x)) {
            throw new Error(`det.payload.matches[${i}]: 바탕에 없는 도형`);
          }
          return x;
        });
        return {
          base,
          moved: scene.moved,
          det: { det: num(o, 'det', 'det.payload'), matches },
          step: { kind: 'det' },
        };
      }
      default:
        throw new Error(`determinant-area 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
