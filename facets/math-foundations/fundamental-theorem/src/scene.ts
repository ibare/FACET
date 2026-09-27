/**
 * 장면 — 바탕(곡선 · 범위 · 자리들) · 자취(밟은 자리들) · 이번 걸음.
 *
 * 걸음 0 은 silent init 이 채운다 (곡선 표본과 범위는 알고리즘이 셈한다).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowData, type APt, type Pt, type Stop } from './algorithm.js';

export type FundamentalTheoremBase = {
  curve: Pt[];
  domain: [number, number];
  fRange: [number, number];
  aRange: [number, number];
  edges: number[];
};

export type FundamentalTheoremStep =
  | { kind: 'start' }
  | { kind: 'edge' }
  | { kind: 'compare'; rates: number[]; heights: number[]; tolerance: number; match: boolean };

export type FundamentalTheoremScene = {
  base: FundamentalTheoremBase | null;
  /** 밟은 자리들 — 마지막이 지금 오른쪽 끝 */
  stops: Stop[];
  step: FundamentalTheoremStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`fundamentalTheoremScene: ${path} ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '가 유한한 수가 아니다');
  return v;
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '가 객체가 아니다');
  return v as Record<string, unknown>;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, '가 배열이 아니다');
  return v;
}

function pair(v: unknown, path: string): [number, number] {
  const a = arr(v, path);
  if (a.length !== 2) fail(path, '의 길이가 2 가 아니다');
  const lo = num(a[0], `${path}[0]`);
  const hi = num(a[1], `${path}[1]`);
  if (lo > hi) fail(path, '의 앞이 뒤보다 크다');
  return [lo, hi];
}

function aPt(v: unknown, path: string): APt {
  const o = rec(v, path);
  return { x: num(o.x, `${path}.x`), a: num(o.a, `${path}.a`) };
}

function stop(v: unknown, path: string): Stop {
  const o = rec(v, path);
  const pathPts = arr(o.path, `${path}.path`).map((p, i) => aPt(p, `${path}.path[${i}]`));
  if (pathPts.length === 0) fail(`${path}.path`, '가 비었다');
  const s: Stop = {
    x: num(o.x, `${path}.x`),
    area: num(o.area, `${path}.area`),
    rate: num(o.rate, `${path}.rate`),
    height: num(o.height, `${path}.height`),
    from: num(o.from, `${path}.from`),
    was: num(o.was, `${path}.was`),
    path: pathPts,
    rise: aPt(o.rise, `${path}.rise`),
  };
  const head = pathPts[0];
  const tail = pathPts[pathPts.length - 1];
  if (head.x !== s.from) fail(`${path}.path[0].x`, `(${head.x}) 가 from (${s.from}) 과 어긋난다`);
  if (tail.x !== s.x || tail.a !== s.area) fail(`${path}.path 끝`, '이 이 자리의 (x, A) 와 어긋난다');
  return s;
}

export const fundamentalTheoremScene: ScenePlan<FundamentalTheoremScene> = {
  initial(initialData: unknown): FundamentalTheoremScene {
    narrowData(initialData);
    return { base: null, stops: [], step: null };
  },

  reduce(scene: FundamentalTheoremScene, event: FacetRuntimeEvent): FundamentalTheoremScene {
    switch (event.type) {
      case 'init': {
        if (scene.base !== null) fail('init', '이 두 번 왔다');
        const p = rec(event.payload, 'init.payload');
        const curve = arr(p.curve, 'init.payload.curve').map((c, i) => {
          const o = rec(c, `init.payload.curve[${i}]`);
          return { t: num(o.t, `init.payload.curve[${i}].t`), y: num(o.y, `init.payload.curve[${i}].y`) };
        });
        if (curve.length < 2) fail('init.payload.curve', '의 표본이 둘보다 적다');
        const edges = arr(p.edges, 'init.payload.edges').map((e, i) => num(e, `init.payload.edges[${i}]`));
        const first = stop(p.first, 'init.payload.first');
        if (edges.length === 0 || first.x !== edges[0]) fail('init.payload.first.x', '가 첫 자리와 어긋난다');
        return {
          base: {
            curve,
            domain: pair(p.domain, 'init.payload.domain'),
            fRange: pair(p.fRange, 'init.payload.fRange'),
            aRange: pair(p.aRange, 'init.payload.aRange'),
            edges,
          },
          stops: [first],
          step: { kind: 'start' },
        };
      }
      case 'edge': {
        if (scene.base === null) fail('edge', '가 init 보다 먼저 왔다');
        if (scene.step?.kind === 'compare') fail('edge', '가 compare 뒤에 왔다');
        const s = stop(event.payload, 'edge.payload');
        const prev = scene.stops[scene.stops.length - 1];
        if (s.from !== prev.x) fail('edge.payload.from', `(${s.from}) 가 지금 자리 (${prev.x}) 와 어긋난다`);
        if (s.was !== prev.area) fail('edge.payload.was', '가 지금 A 와 어긋난다');
        const want = scene.base.edges[scene.stops.length];
        if (want === undefined) fail('edge', '가 자리 수보다 많이 왔다');
        if (s.x !== want) fail('edge.payload.x', `(${s.x}) 가 다음 자리 (${want}) 와 어긋난다`);
        return { base: scene.base, stops: [...scene.stops, s], step: { kind: 'edge' } };
      }
      case 'compare': {
        if (scene.base === null) fail('compare', '가 init 보다 먼저 왔다');
        if (scene.stops.length !== scene.base.edges.length) fail('compare', '가 모든 자리를 밟기 전에 왔다');
        const p = rec(event.payload, 'compare.payload');
        const rates = arr(p.rates, 'compare.payload.rates').map((r, i) => num(r, `compare.payload.rates[${i}]`));
        const heights = arr(p.heights, 'compare.payload.heights').map((h, i) => num(h, `compare.payload.heights[${i}]`));
        if (rates.length !== scene.stops.length || heights.length !== scene.stops.length) {
          fail('compare.payload', '의 차례 길이가 밟은 자리 수와 어긋난다');
        }
        rates.forEach((r, i) => {
          if (r !== scene.stops[i].rate) fail(`compare.payload.rates[${i}]`, '가 그 자리의 빠르기와 어긋난다');
        });
        heights.forEach((h, i) => {
          if (h !== scene.stops[i].height) fail(`compare.payload.heights[${i}]`, '가 그 자리의 높이와 어긋난다');
        });
        if (typeof p.match !== 'boolean') fail('compare.payload.match', '가 참거짓이 아니다');
        return {
          base: scene.base,
          stops: [...scene.stops],
          step: { kind: 'compare', rates, heights, tolerance: num(p.tolerance, 'compare.payload.tolerance'), match: p.match },
        };
      }
      default:
        throw new Error(`fundamentalTheoremScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
