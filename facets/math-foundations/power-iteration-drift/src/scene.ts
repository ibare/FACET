/**
 * power-iteration-drift 의 장면.
 *
 * 바탕   matrix · count (initialData) + basis (init 이 한 번 정한다 — 고유값 · 목표 방향 · 걸음 0 · 틈 축 범위)
 * 자취   trail — 걸음 1..k 의 곱 (Sample)
 * 이번   step — 걸음 0 인지, 몇 번째 곱인지
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowPowerIterationDriftData,
  type Basis,
  type Mat2,
  type Sample,
  type Vec2,
} from './algorithm.js';

export type PowerIterationDriftStep = { kind: 'start' } | { kind: 'multiply'; k: number };

export type PowerIterationDriftScene = {
  matrix: Mat2;
  count: number;
  basis: Basis | null;
  trail: Sample[];
  step: PowerIterationDriftStep;
};

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`powerIterationDriftScene: ${path} 는 유한한 수여야 한다`);
  }
  return value;
}

function numOrNull(value: unknown, path: string): number | null {
  return value === null ? null : num(value, path);
}

function vec(value: unknown, path: string): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`powerIterationDriftScene: ${path} 는 수 두 개여야 한다`);
  }
  return [num(value[0], `${path}[0]`), num(value[1], `${path}[1]`)];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`powerIterationDriftScene: ${path} 가 객체가 아니다`);
  }
  return value as Record<string, unknown>;
}

function sampleOf(value: unknown, path: string): Sample {
  const s = record(value, path);
  return {
    k: num(s.k, `${path}.k`),
    w: s.w === null ? null : vec(s.w, `${path}.w`),
    stretch: numOrNull(s.stretch, `${path}.stretch`),
    v: vec(s.v, `${path}.v`),
    angle: num(s.angle, `${path}.angle`),
    gap: num(s.gap, `${path}.gap`),
    ratio: numOrNull(s.ratio, `${path}.ratio`),
  };
}

export const powerIterationDriftScene: ScenePlan<PowerIterationDriftScene> = {
  initial(initialData: unknown): PowerIterationDriftScene {
    const data = narrowPowerIterationDriftData(initialData);
    return {
      matrix: [
        [data.matrix[0][0], data.matrix[0][1]],
        [data.matrix[1][0], data.matrix[1][1]],
      ],
      count: data.multiplications,
      basis: null,
      trail: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: PowerIterationDriftScene, event: FacetRuntimeEvent): PowerIterationDriftScene {
    switch (event.type) {
      case 'init': {
        const p = record(event.payload, 'init.payload');
        const start = sampleOf(p.start, 'init.payload.start');
        if (start.k !== 0 || start.w !== null) {
          throw new Error('powerIterationDriftScene: init.payload.start 는 걸음 0 이어야 한다');
        }
        const count = num(p.count, 'init.payload.count');
        if (count !== scene.count) {
          throw new Error('powerIterationDriftScene: init.payload.count 가 initialData 와 다르다');
        }
        const basis: Basis = {
          lambda1: num(p.lambda1, 'init.payload.lambda1'),
          lambda2: num(p.lambda2, 'init.payload.lambda2'),
          targetAngle: num(p.targetAngle, 'init.payload.targetAngle'),
          start,
          gapTop: num(p.gapTop, 'init.payload.gapTop'),
          gapBottom: num(p.gapBottom, 'init.payload.gapBottom'),
          count,
        };
        if (!(basis.gapTop > 0 && basis.gapBottom > 0 && basis.gapTop >= basis.gapBottom)) {
          throw new Error('powerIterationDriftScene: init.payload 의 틈 범위가 어긋났다');
        }
        return { ...scene, basis, trail: [], step: { kind: 'start' } };
      }
      case 'multiply': {
        if (scene.basis === null) {
          throw new Error('powerIterationDriftScene: init 앞에 multiply 가 왔다');
        }
        const sample = sampleOf(event.payload, 'multiply.payload');
        if (sample.k !== scene.trail.length + 1 || sample.k > scene.count) {
          throw new Error(
            `powerIterationDriftScene: multiply.payload.k 가 ${String(scene.trail.length + 1)} 이어야 한다 (${String(sample.k)})`,
          );
        }
        if (sample.w === null || sample.stretch === null) {
          throw new Error('powerIterationDriftScene: multiply.payload.w · stretch 가 비었다');
        }
        return { ...scene, trail: [...scene.trail, sample], step: { kind: 'multiply', k: sample.k } };
      }
      default:
        throw new Error(`powerIterationDriftScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
