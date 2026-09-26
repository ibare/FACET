/**
 * loss-measures-wrongness 의 장면.
 *
 * 바탕 — 보기 다섯(initialData 에서 베낀다)과 곡선 · 세로 끝(silent init 이 싣는다).
 * 자취 — 셈한 보기들의 값과 여기까지의 합, 끝에 평균.
 * 이번 걸음 — 처음 · 보기 하나 셈 · 나누기.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLossData, type LossExample } from './algorithm.js';

export type LossBasis = {
  curve: [number, number][];
  valueTop: number;
  stackTop: number;
};

export type LossMeasured = {
  index: number;
  id: string;
  given: number;
  gap: number;
  value: number;
  ratio: number;
  sum: number;
};

export type LossMean = { sum: number; count: number; mean: number };

export type LossStep =
  | { kind: 'start' }
  | { kind: 'measure'; index: number }
  | { kind: 'average' };

export type LossScene = {
  examples: LossExample[];
  basis: LossBasis | null;
  measured: LossMeasured[];
  mean: LossMean | null;
  step: LossStep;
};

function fail(msg: string): never {
  throw new Error(`lossMeasuresWrongnessScene: ${msg}`);
}

function num(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${key} 가 수가 아니다`);
  return v;
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) fail(`${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function readBasis(payload: unknown): LossBasis {
  const o = record(payload, 'init.payload');
  if (!Array.isArray(o.curve) || o.curve.length < 2) fail('init.payload.curve 가 비었다');
  const curve = o.curve.map((pt: unknown, i: number): [number, number] => {
    if (!Array.isArray(pt) || pt.length !== 2) fail(`init.payload.curve[${i}] 가 점이 아니다`);
    const [g, v] = pt as unknown[];
    if (typeof g !== 'number' || typeof v !== 'number') {
      fail(`init.payload.curve[${i}] 가 수 둘이 아니다`);
    }
    return [g, v];
  });
  return {
    curve,
    valueTop: num(o, 'valueTop', 'init.payload'),
    stackTop: num(o, 'stackTop', 'init.payload'),
  };
}

export const lossMeasuresWrongnessScene: ScenePlan<LossScene> = {
  initial(initialData: unknown): LossScene {
    const data = narrowLossData(initialData);
    return {
      examples: data.examples.map((e) => ({ ...e })),
      basis: null,
      measured: [],
      mean: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LossScene, event: FacetRuntimeEvent): LossScene {
    switch (event.type) {
      case 'init': {
        return { ...scene, basis: readBasis(event.payload), step: { kind: 'start' } };
      }
      case 'measure': {
        if (scene.basis === null) fail('measure 가 init 보다 먼저 왔다');
        const o = record(event.payload, 'measure.payload');
        const index = num(o, 'index', 'measure.payload');
        if (index !== scene.measured.length) {
          fail(`measure.payload.index ${index} 가 다음 차례 ${scene.measured.length} 와 어긋난다`);
        }
        const ex = scene.examples[index];
        if (ex === undefined) fail(`measure.payload.index ${index} 에 보기가 없다`);
        if (o.id !== ex.id) fail(`measure.payload.id 가 보기 ${ex.id} 와 어긋난다`);
        const m: LossMeasured = {
          index,
          id: ex.id,
          given: num(o, 'given', 'measure.payload'),
          gap: num(o, 'gap', 'measure.payload'),
          value: num(o, 'value', 'measure.payload'),
          ratio: num(o, 'ratio', 'measure.payload'),
          sum: num(o, 'sum', 'measure.payload'),
        };
        return {
          ...scene,
          measured: [...scene.measured, m],
          step: { kind: 'measure', index },
        };
      }
      case 'average': {
        if (scene.measured.length !== scene.examples.length) {
          fail('average 가 보기를 다 셈하기 전에 왔다');
        }
        const o = record(event.payload, 'average.payload');
        const mean: LossMean = {
          sum: num(o, 'sum', 'average.payload'),
          count: num(o, 'count', 'average.payload'),
          mean: num(o, 'mean', 'average.payload'),
        };
        if (mean.count !== scene.examples.length) fail('average.payload.count 가 보기 수와 어긋난다');
        return { ...scene, mean, step: { kind: 'average' } };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
