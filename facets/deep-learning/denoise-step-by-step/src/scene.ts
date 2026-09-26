/**
 * denoise-step-by-step 장면.
 *
 * 바탕: 배운 자료(samples) · 걸음 수 T — initialData 에서 베낀다.
 * 자취: 지금까지 선 x_t 들(x_T 부터) · 가장 최근 예측.
 * 이번 걸음: 시작 · 예측(앞 예측을 계기값으로) · 걷어냄(출발 x_t 를 계기값으로).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readDenoiseData } from './algorithm.js';

export type DenoiseSampleView = { id: string; cells: readonly number[] };

export type DenoisePrediction = {
  tIndex: number;
  epsHat: readonly number[];
  x0Hat: readonly number[];
  weights: readonly number[];
};

export type DenoiseStep =
  | { kind: 'start'; tIndex: number }
  | { kind: 'predict'; tIndex: number; was: DenoisePrediction | null }
  | {
      kind: 'denoise';
      tIndex: number;
      from: readonly number[];
      mean: readonly number[];
      sigma: number;
      distances: readonly number[];
    };

export type DenoiseScene = {
  samples: readonly DenoiseSampleView[];
  total: number;
  /** trail[k] = x_{T−k} */
  trail: readonly (readonly number[])[];
  pred: DenoisePrediction | null;
  step: DenoiseStep;
};

function numArray(v: unknown, name: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`denoise-step-by-step 장면: ${name} 가 수 배열이 아니다`);
  }
  return [...(v as number[])];
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`denoise-step-by-step 장면: ${name} 가 수가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`denoise-step-by-step 장면: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const denoiseStepByStepScene: ScenePlan<DenoiseScene> = {
  initial(initialData: unknown): DenoiseScene {
    const d = readDenoiseData(initialData);
    return {
      samples: d.samples.map((s) => ({ id: s.id, cells: [...s.cells] })),
      total: d.betas.length,
      trail: [[...d.start]],
      pred: null,
      step: { kind: 'start', tIndex: d.betas.length },
    };
  },

  reduce(scene: DenoiseScene, event: FacetRuntimeEvent): DenoiseScene {
    if (event.type === 'predict') {
      const p = payloadOf(event);
      const pred: DenoisePrediction = {
        tIndex: num(p.tIndex, 'tIndex'),
        epsHat: numArray(p.epsHat, 'epsHat'),
        x0Hat: numArray(p.x0Hat, 'x0Hat'),
        weights: numArray(p.weights, 'weights'),
      };
      return { ...scene, pred, step: { kind: 'predict', tIndex: pred.tIndex, was: scene.pred } };
    }
    if (event.type === 'denoise') {
      const p = payloadOf(event);
      const from = scene.trail[scene.trail.length - 1];
      if (from === undefined) throw new Error('denoise-step-by-step 장면: 출발 x_t 가 없다');
      const next = numArray(p.next, 'next');
      return {
        ...scene,
        trail: [...scene.trail, next],
        step: {
          kind: 'denoise',
          tIndex: num(p.tIndex, 'tIndex'),
          from,
          mean: numArray(p.mean, 'mean'),
          sigma: num(p.sigma, 'sigma'),
          distances: numArray(p.distances, 'distances'),
        },
      };
    }
    throw new Error(`denoise-step-by-step 장면: 모르는 이벤트 ${event.type}`);
  },
};
