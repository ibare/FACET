/**
 * vector-normalize 장면.
 *
 * 바탕  vectors(원래 넷) · base(init 이 싣는 길이 · 각 · 틀)
 * 자취  units — 벡터마다 나눈 결과. 아직 나누지 않았으면 null
 * 이번  step — 이번 걸음에 나눈 벡터의 자리와 길이의 출발 · 도착
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowVectorNormalizeData, type NormalizeBounds, type NormalizeVector } from './algorithm.js';

export type NormalizeBase = {
  lengths: readonly number[];
  angles: readonly number[];
  /** 원래 줄의 방향 (길이 1) — 알고리즘이 셈해 init 에 싣는다 */
  directions: readonly { x: number; y: number }[];
  bounds: NormalizeBounds;
  maxLength: number;
};

export type NormalizeUnit = {
  x: number;
  y: number;
  length: number;
  angleBefore: number;
  angleAfter: number;
  factor: number;
  divisor: number;
};

export type NormalizeStep = { index: number; from: number; to: number };

export type VectorNormalizeScene = {
  vectors: readonly NormalizeVector[];
  base: NormalizeBase | null;
  units: readonly (NormalizeUnit | null)[];
  step: NormalizeStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(rec: Record<string, unknown>, key: string, path: string): number {
  const v = rec[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`vectorNormalizeScene: ${path}.${key} 가 수가 아니다`);
  }
  return v;
}

function numList(rec: Record<string, unknown>, key: string, count: number, path: string): number[] {
  const v = rec[key];
  if (!Array.isArray(v) || v.length !== count) {
    throw new Error(`vectorNormalizeScene: ${path}.${key} 가 길이 ${count} 의 배열이 아니다`);
  }
  return v.map((item: unknown, i: number) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new Error(`vectorNormalizeScene: ${path}.${key}[${i}] 가 수가 아니다`);
    }
    return item;
  });
}

function dirList(rec: Record<string, unknown>, count: number): { x: number; y: number }[] {
  const v = rec['directions'];
  if (!Array.isArray(v) || v.length !== count) {
    throw new Error(`vectorNormalizeScene: init.payload.directions 가 길이 ${count} 의 배열이 아니다`);
  }
  return v.map((item: unknown, i: number) => {
    if (!isRecord(item)) throw new Error(`vectorNormalizeScene: init.payload.directions[${i}] 가 객체가 아니다`);
    const path = `init.payload.directions[${i}]`;
    return { x: num(item, 'x', path), y: num(item, 'y', path) };
  });
}

function reduceInit(scene: VectorNormalizeScene, payload: unknown): VectorNormalizeScene {
  if (scene.base !== null) throw new Error('vectorNormalizeScene: init 이 두 번 왔다');
  if (!isRecord(payload)) throw new Error('vectorNormalizeScene: init.payload 가 객체가 아니다');
  const count = scene.vectors.length;
  const b = payload['bounds'];
  if (!isRecord(b)) throw new Error('vectorNormalizeScene: init.payload.bounds 가 객체가 아니다');
  const base: NormalizeBase = {
    lengths: numList(payload, 'lengths', count, 'init.payload'),
    angles: numList(payload, 'angles', count, 'init.payload'),
    directions: dirList(payload, count),
    bounds: {
      minX: num(b, 'minX', 'init.payload.bounds'),
      maxX: num(b, 'maxX', 'init.payload.bounds'),
      minY: num(b, 'minY', 'init.payload.bounds'),
      maxY: num(b, 'maxY', 'init.payload.bounds'),
    },
    maxLength: num(payload, 'maxLength', 'init.payload'),
  };
  return { ...scene, base, step: null };
}

function reduceNormalize(scene: VectorNormalizeScene, payload: unknown): VectorNormalizeScene {
  const base = scene.base;
  if (base === null) throw new Error('vectorNormalizeScene: init 앞에 normalize 가 왔다');
  if (!isRecord(payload)) throw new Error('vectorNormalizeScene: normalize.payload 가 객체가 아니다');
  const p = 'normalize.payload';
  const index = num(payload, 'index', p);
  const expected = scene.units.findIndex((u) => u === null);
  if (expected === -1) throw new Error('vectorNormalizeScene: 나눌 벡터가 남지 않았는데 normalize 가 왔다');
  if (index !== expected) {
    throw new Error(`vectorNormalizeScene: ${p}.index 가 ${index} 인데 다음 차례는 ${expected} 다`);
  }
  const was = base.lengths[index];
  if (was === undefined) throw new Error(`vectorNormalizeScene: base.lengths[${index}] 가 없다`);
  const divisor = num(payload, 'divisor', p);
  if (divisor !== was) {
    throw new Error(`vectorNormalizeScene: ${p}.divisor 가 ${divisor} 인데 지금 길이는 ${was} 다`);
  }
  const unit: NormalizeUnit = {
    x: num(payload, 'x', p),
    y: num(payload, 'y', p),
    length: num(payload, 'length', p),
    angleBefore: num(payload, 'angleBefore', p),
    angleAfter: num(payload, 'angleAfter', p),
    factor: num(payload, 'factor', p),
    divisor,
  };
  const units = scene.units.map((u, i) => (i === index ? unit : u));
  return { ...scene, units, step: { index, from: was, to: unit.length } };
}

export const vectorNormalizeScene: ScenePlan<VectorNormalizeScene> = {
  initial(initialData: unknown): VectorNormalizeScene {
    const data = narrowVectorNormalizeData(initialData);
    return {
      vectors: data.vectors.map((v) => ({ name: v.name, x: v.x, y: v.y })),
      base: null,
      units: data.vectors.map(() => null),
      step: null,
    };
  },
  reduce(scene: VectorNormalizeScene, event: FacetRuntimeEvent): VectorNormalizeScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'normalize':
        return reduceNormalize(scene, event.payload);
      default:
        throw new Error(`vectorNormalizeScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
