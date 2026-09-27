/**
 * vector-scale 장면.
 *
 * 바탕(base)   init 이 한 번 정하는 것 — v · 처음 길이 · 방향 · 축척 범위
 * 자취(trail)  지금까지 곱한 k 와 그 머리 — 곧은 줄 위의 눈금이 된다
 * 이번 걸음(step) 지금 k 의 값과 운동의 출발점(from)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowVectorScaleData, type Vec2 } from './algorithm.js';

export type VectorScaleBase = {
  v: Vec2;
  len0: number;
  unit: Vec2;
  maxLength: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

export type VectorScaleMark = { k: number; head: Vec2 };

export type VectorScaleStep = {
  change: 'start' | 'grow' | 'shrink';
  k: number;
  head: Vec2;
  length: number;
  angle: number;
  ratio: number;
  /** 운동의 출발점 — 걸음 0 은 없다 */
  from: Vec2 | null;
};

export type VectorScaleScene = {
  vectorName: string;
  scalarName: string;
  base: VectorScaleBase | null;
  trail: VectorScaleMark[];
  step: VectorScaleStep | null;
};

function field(p: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in p)) throw new Error(`vector-scale 장면: ${path}.${key} 가 없다`);
  return p[key];
}

function num(p: Record<string, unknown>, key: string, path: string): number {
  const x = field(p, key, path);
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`vector-scale 장면: ${path}.${key} 가 유한한 수가 아니다`);
  }
  return x;
}

function vec(p: Record<string, unknown>, key: string, path: string): Vec2 {
  const x = field(p, key, path);
  if (!Array.isArray(x) || x.length !== 2) {
    throw new Error(`vector-scale 장면: ${path}.${key} 가 수 둘이 아니다`);
  }
  const [a, b] = x as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error(`vector-scale 장면: ${path}.${key} 가 수 둘이 아니다`);
  }
  return [a, b];
}

function record(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new Error(`vector-scale 장면: ${path} 가 객체가 아니다`);
  }
  return x as Record<string, unknown>;
}

function values(p: Record<string, unknown>, path: string) {
  return {
    k: num(p, 'k', path),
    head: vec(p, 'head', path),
    length: num(p, 'length', path),
    angle: num(p, 'angle', path),
    ratio: num(p, 'ratio', path),
  };
}

export const vectorScaleScene: ScenePlan<VectorScaleScene> = {
  initial(initialData: unknown): VectorScaleScene {
    const data = narrowVectorScaleData(initialData);
    return {
      vectorName: data.vectorName,
      scalarName: data.scalarName,
      base: null,
      trail: [],
      step: null,
    };
  },

  reduce(scene: VectorScaleScene, event: FacetRuntimeEvent): VectorScaleScene {
    switch (event.type) {
      case 'init': {
        const p = record(event.payload, 'init.payload');
        const b = record(field(p, 'bounds', 'init.payload'), 'init.payload.bounds');
        const base: VectorScaleBase = {
          v: vec(p, 'v', 'init.payload'),
          len0: num(p, 'len0', 'init.payload'),
          unit: vec(p, 'unit', 'init.payload'),
          maxLength: num(p, 'maxLength', 'init.payload'),
          bounds: {
            minX: num(b, 'minX', 'init.payload.bounds'),
            maxX: num(b, 'maxX', 'init.payload.bounds'),
            minY: num(b, 'minY', 'init.payload.bounds'),
            maxY: num(b, 'maxY', 'init.payload.bounds'),
          },
        };
        const s = values(p, 'init.payload');
        return {
          vectorName: scene.vectorName,
          scalarName: scene.scalarName,
          base,
          trail: [{ k: s.k, head: [s.head[0], s.head[1]] }],
          step: { change: 'start', ...s, from: null },
        };
      }
      case 'scale': {
        if (!scene.base || !scene.step) {
          throw new Error('vector-scale 장면: init 보다 scale 이 먼저 왔다');
        }
        const p = record(event.payload, 'scale.payload');
        const s = values(p, 'scale.payload');
        const from = vec(p, 'from', 'scale.payload');
        const now = scene.step.head;
        if (from[0] !== now[0] || from[1] !== now[1]) {
          throw new Error(
            `vector-scale 장면: scale.payload.from (${from.join(', ')}) 가 지금 머리 (${now.join(', ')}) 와 다르다`,
          );
        }
        const change = field(p, 'change', 'scale.payload');
        if (change !== 'grow' && change !== 'shrink') {
          throw new Error(`vector-scale 장면: scale.payload.change 를 모른다 (${String(change)})`);
        }
        return {
          vectorName: scene.vectorName,
          scalarName: scene.scalarName,
          base: scene.base,
          trail: [...scene.trail, { k: s.k, head: [s.head[0], s.head[1]] }],
          step: { change, ...s, from },
        };
      }
      default:
        throw new Error(`vector-scale 장면: 모르는 이벤트 '${event.type}'`);
    }
  },
};
