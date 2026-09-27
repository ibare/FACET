import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowReflectAndRefractData, type Extent, type Vec2 } from './algorithm.js';

/** 광선 하나의 자취 — 걸음이 쌓는다 */
export type TraceState = {
  id: string;
  origin: Vec2;
  hit: null | {
    point: Vec2;
    tHit: number;
    dir: Vec2;
    normal: Vec2;
    incidence: number;
    n1: number;
    n2: number;
  };
  reflect: null | { dir: Vec2; angle: number };
  refraction:
    | null
    | { kind: 'refract'; dir: Vec2; angle: number; sin: number; bend: number }
    | { kind: 'none'; sin: number; n1: number; n2: number; incidence: number };
};

export type ReflectAndRefractStep =
  | { kind: 'start' }
  | { kind: 'hit'; ray: string }
  | { kind: 'reflect'; ray: string }
  | { kind: 'refract'; ray: string }
  | { kind: 'no-refract'; ray: string };

export type ReflectAndRefractScene = {
  /** 바탕 — 자료와 init 이 한 번 정한다 */
  base: {
    boundaryY: number;
    above: { id: string; n: number };
    below: { id: string; n: number };
    /** 알고리즘이 silent init 으로 싣는다. 그 전에는 null */
    extent: Extent | null;
  };
  /** 자취 — 자료의 광선 차례 그대로 */
  traces: TraceState[];
  /** 이번 걸음 */
  step: ReflectAndRefractStep;
};

// ---------- payload 좁히기 ----------

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    throw new Error(`reflect-and-refract scene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`reflect-and-refract scene: ${type}.payload.${key} 는 유한한 수여야 한다`);
  }
  return v;
}

function vec(p: Record<string, unknown>, key: string, type: string): Vec2 {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
    throw new Error(`reflect-and-refract scene: ${type}.payload.${key} 는 [x, y] 여야 한다`);
  }
  return [v[0], v[1]];
}

function rayIndex(scene: ReflectAndRefractScene, p: Record<string, unknown>, type: string): number {
  const id = p.ray;
  if (typeof id !== 'string') throw new Error(`reflect-and-refract scene: ${type}.payload.ray 가 문자열이 아니다`);
  const i = scene.traces.findIndex((trace) => trace.id === id);
  if (i < 0) throw new Error(`reflect-and-refract scene: ${type}.payload.ray '${id}' 는 자료에 없는 광선이다`);
  return i;
}

function withTrace(scene: ReflectAndRefractScene, i: number, next: TraceState, step: ReflectAndRefractStep): ReflectAndRefractScene {
  return {
    base: scene.base,
    traces: scene.traces.map((trace, j) => (j === i ? next : trace)),
    step,
  };
}

// ---------- 장면 ----------

export const reflectAndRefractScene: ScenePlan<ReflectAndRefractScene> = {
  initial(initialData: unknown): ReflectAndRefractScene {
    const data = narrowReflectAndRefractData(initialData);
    return {
      base: {
        boundaryY: data.boundaryY,
        above: { id: data.above.id, n: data.above.n },
        below: { id: data.below.id, n: data.below.n },
        extent: null,
      },
      traces: data.rays.map((r) => ({
        id: r.id,
        origin: [r.origin[0], r.origin[1]] as Vec2,
        hit: null,
        reflect: null,
        refraction: null,
      })),
      step: { kind: 'start' },
    };
  },

  reduce(scene: ReflectAndRefractScene, event: FacetRuntimeEvent): ReflectAndRefractScene {
    const type = event.type;
    switch (type) {
      case 'init': {
        const p = payloadOf(event);
        const e = p.extent;
        if (typeof e !== 'object' || e === null || Array.isArray(e)) {
          throw new Error('reflect-and-refract scene: init.payload.extent 가 객체가 아니다');
        }
        const er = e as Record<string, unknown>;
        const extent: Extent = {
          minX: num(er, 'minX', 'init.extent'),
          maxX: num(er, 'maxX', 'init.extent'),
          minY: num(er, 'minY', 'init.extent'),
          maxY: num(er, 'maxY', 'init.extent'),
        };
        if (!(extent.maxX > extent.minX) || !(extent.maxY > extent.minY)) {
          throw new Error('reflect-and-refract scene: init.payload.extent 의 폭 또는 높이가 0 이하다');
        }
        return { base: { ...scene.base, extent }, traces: scene.traces, step: scene.step };
      }
      case 'hit': {
        if (scene.base.extent === null) throw new Error('reflect-and-refract scene: init 보다 hit 가 먼저 왔다');
        const p = payloadOf(event);
        const i = rayIndex(scene, p, type);
        const trace = scene.traces[i]!;
        if (trace.hit !== null) throw new Error(`reflect-and-refract scene: 광선 '${trace.id}' 는 이미 닿았다`);
        return withTrace(
          scene,
          i,
          {
            ...trace,
            hit: {
              point: vec(p, 'point', type),
              tHit: num(p, 'tHit', type),
              dir: vec(p, 'dir', type),
              normal: vec(p, 'normal', type),
              incidence: num(p, 'incidence', type),
              n1: num(p, 'n1', type),
              n2: num(p, 'n2', type),
            },
          },
          { kind: 'hit', ray: trace.id },
        );
      }
      case 'reflect': {
        const p = payloadOf(event);
        const i = rayIndex(scene, p, type);
        const trace = scene.traces[i]!;
        if (trace.hit === null) throw new Error(`reflect-and-refract scene: 광선 '${trace.id}' 가 닿기 전에 reflect 가 왔다`);
        if (trace.reflect !== null) throw new Error(`reflect-and-refract scene: 광선 '${trace.id}' 는 이미 튕겼다`);
        return withTrace(
          scene,
          i,
          { ...trace, reflect: { dir: vec(p, 'dir', type), angle: num(p, 'angle', type) } },
          { kind: 'reflect', ray: trace.id },
        );
      }
      case 'refract':
      case 'no-refract': {
        const p = payloadOf(event);
        const i = rayIndex(scene, p, type);
        const trace = scene.traces[i]!;
        if (trace.reflect === null) throw new Error(`reflect-and-refract scene: 광선 '${trace.id}' 가 튕기기 전에 ${type} 가 왔다`);
        if (trace.refraction !== null) throw new Error(`reflect-and-refract scene: 광선 '${trace.id}' 의 굴절은 이미 정해졌다`);
        if (type === 'refract') {
          return withTrace(
            scene,
            i,
            {
              ...trace,
              refraction: {
                kind: 'refract',
                dir: vec(p, 'dir', type),
                angle: num(p, 'angle', type),
                sin: num(p, 'sin', type),
                bend: num(p, 'bend', type),
              },
            },
            { kind: 'refract', ray: trace.id },
          );
        }
        return withTrace(
          scene,
          i,
          {
            ...trace,
            refraction: {
              kind: 'none',
              sin: num(p, 'sin', type),
              n1: num(p, 'n1', type),
              n2: num(p, 'n2', type),
              incidence: num(p, 'incidence', type),
            },
          },
          { kind: 'no-refract', ray: trace.id },
        );
      }
      default:
        throw new Error(`reflect-and-refract scene: 모르는 이벤트 '${type}'`);
    }
  },
};
