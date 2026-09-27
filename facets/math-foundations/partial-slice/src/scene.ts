/**
 * partial-slice 의 장면.
 *
 * 바탕(base)은 silent init 이 한 번 정한다 — 격자 · 함숫값 · 단면 틀. 자취는 떨어져 나온
 * 단면(slices) · 잰 기울기(slopes) · 나란히 둔 두 수(both). 이번 걸음은 step.
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPartialSliceData, type Axis, type Sample } from './algorithm.js';

export type SliceFrame = { free: Axis; held: Axis; at: number; lo: number; hi: number; max: number };

export type SliceBase = {
  formula: string;
  f: number;
  grid: { xs: number[]; ys: number[]; values: number[][]; max: number };
  frames: SliceFrame[];
};

export type CutSlice = {
  free: Axis;
  held: Axis;
  at: number;
  formula: string;
  dots: Sample[];
  curve: Sample[];
};

export type SliceSlope = { free: Axis; a: number; v: number; slope: number; symbol: string };

export type SlopePair = Array<{ free: Axis; symbol: string; value: number }>;

export type SliceStep =
  | { kind: 'init' }
  | { kind: 'slice'; free: Axis }
  | { kind: 'slope'; free: Axis }
  | { kind: 'both' };

export type PartialSliceScene = {
  point: { x: number; y: number };
  domain: { x: [number, number]; y: [number, number] };
  base: SliceBase | null;
  slices: CutSlice[];
  slopes: SliceSlope[];
  both: SlopePair | null;
  step: SliceStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`partialSliceScene: ${path} — ${why}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') fail(path, '빈 글자이거나 글자가 아니다');
  return v;
}

function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, '비었거나 배열이 아니다');
  return v;
}

function axis(v: unknown, path: string): Axis {
  if (v !== 'x' && v !== 'y') fail(path, "'x' 나 'y' 가 아니다");
  return v;
}

function nums(v: unknown, path: string): number[] {
  return list(v, path).map((n, i) => num(n, `${path}[${i}]`));
}

function samples(v: unknown, path: string): Sample[] {
  return list(v, path).map((s, i) => {
    const o = rec(s, `${path}[${i}]`);
    return { a: num(o.a, `${path}[${i}].a`), v: num(o.v, `${path}[${i}].v`) };
  });
}

function readBase(payload: unknown): SliceBase {
  const p = rec(payload, 'init.payload');
  const g = rec(p.grid, 'init.payload.grid');
  const xs = nums(g.xs, 'init.payload.grid.xs');
  const ys = nums(g.ys, 'init.payload.grid.ys');
  const values = list(g.values, 'init.payload.grid.values').map((row, j) => {
    const r = nums(row, `init.payload.grid.values[${j}]`);
    if (r.length !== xs.length) fail(`init.payload.grid.values[${j}]`, 'xs 와 길이가 다르다');
    return r;
  });
  if (values.length !== ys.length) fail('init.payload.grid.values', 'ys 와 길이가 다르다');
  const frames = list(p.frames, 'init.payload.frames').map((fr, i): SliceFrame => {
    const o = rec(fr, `init.payload.frames[${i}]`);
    const path = `init.payload.frames[${i}]`;
    const free = axis(o.free, `${path}.free`);
    const held = axis(o.held, `${path}.held`);
    if (free === held) fail(path, 'free 와 held 가 같다');
    return { free, held, at: num(o.at, `${path}.at`), lo: num(o.lo, `${path}.lo`), hi: num(o.hi, `${path}.hi`), max: num(o.max, `${path}.max`) };
  });
  return {
    formula: str(p.formula, 'init.payload.formula'),
    f: num(p.f, 'init.payload.f'),
    grid: { xs, ys, values, max: num(g.max, 'init.payload.grid.max') },
    frames,
  };
}

export const partialSliceScene: ScenePlan<PartialSliceScene> = {
  initial(initialData: unknown): PartialSliceScene {
    const data = narrowPartialSliceData(initialData);
    return {
      point: { x: data.point.x, y: data.point.y },
      domain: { x: [data.domain.x[0], data.domain.x[1]], y: [data.domain.y[0], data.domain.y[1]] },
      base: null,
      slices: [],
      slopes: [],
      both: null,
      step: null,
    };
  },

  reduce(scene: PartialSliceScene, event: FacetRuntimeEvent): PartialSliceScene {
    switch (event.type) {
      case 'init': {
        if (scene.base !== null) fail('init', '바탕이 이미 있다');
        return { ...scene, base: readBase(event.payload), step: { kind: 'init' } };
      }
      case 'slice': {
        if (scene.base === null) fail('slice', '바탕보다 먼저 왔다');
        if (scene.slices.length !== scene.slopes.length) fail('slice', '앞 단면의 기울기를 재기 전이다');
        const frame = scene.base.frames[scene.slices.length];
        if (frame === undefined) fail('slice', '틀보다 단면이 많다');
        const p = rec(event.payload, 'slice.payload');
        const free = axis(p.free, 'slice.payload.free');
        const held = axis(p.held, 'slice.payload.held');
        const at = num(p.at, 'slice.payload.at');
        if (free !== frame.free || held !== frame.held) fail('slice.payload.free', '자르는 차례와 다르다');
        if (at !== scene.point[held]) fail('slice.payload.at', '점의 좌표가 아니다');
        const slice: CutSlice = {
          free,
          held,
          at,
          formula: str(p.formula, 'slice.payload.formula'),
          dots: samples(p.dots, 'slice.payload.dots'),
          curve: samples(p.curve, 'slice.payload.curve'),
        };
        return { ...scene, slices: [...scene.slices, slice], step: { kind: 'slice', free } };
      }
      case 'slope': {
        const last = scene.slices[scene.slices.length - 1];
        if (last === undefined || scene.slopes.length !== scene.slices.length - 1) {
          fail('slope', '잴 단면이 없다');
        }
        const p = rec(event.payload, 'slope.payload');
        const free = axis(p.free, 'slope.payload.free');
        if (free !== last.free) fail('slope.payload.free', '마지막 단면의 입력이 아니다');
        const a = num(p.a, 'slope.payload.a');
        if (a !== scene.point[free]) fail('slope.payload.a', '점의 좌표가 아니다');
        const slope: SliceSlope = {
          free,
          a,
          v: num(p.v, 'slope.payload.v'),
          slope: num(p.slope, 'slope.payload.slope'),
          symbol: str(p.symbol, 'slope.payload.symbol'),
        };
        return { ...scene, slopes: [...scene.slopes, slope], step: { kind: 'slope', free } };
      }
      case 'both': {
        if (scene.both !== null) fail('both', '이미 나란히 두었다');
        const p = rec(event.payload, 'both.payload');
        const items = list(p.items, 'both.payload.items').map((it, i) => {
          const o = rec(it, `both.payload.items[${i}]`);
          return {
            free: axis(o.free, `both.payload.items[${i}].free`),
            symbol: str(o.symbol, `both.payload.items[${i}].symbol`),
            value: num(o.value, `both.payload.items[${i}].value`),
          };
        });
        if (items.length !== scene.slopes.length) fail('both.payload.items', '잰 기울기 수와 다르다');
        return { ...scene, both: items, step: { kind: 'both' } };
      }
      default:
        throw new Error(`partialSliceScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
