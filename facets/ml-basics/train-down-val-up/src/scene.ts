/**
 * train-down-val-up 의 장면.
 *
 * 바탕 — 훈련 점 · 검증 점 · 마지막 차수 (initialData), 축 범위 (init)
 * 자취 — 차수마다 잰 맞춤 (`fits`, 차수 차례)
 * 이번 걸음 — 방금 올린 차수와 그 앞 차수의 맞춤 (`step.from`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readTrainDownValUpData, type FitRange, type FitRecord, type Pt } from './algorithm.js';

export type TrainDownValUpStep = { kind: 'raise'; degree: number; from: FitRecord } | null;

export type TrainDownValUpScene = {
  train: Pt[];
  validation: Pt[];
  maxDegree: number;
  range: FitRange | null;
  fits: FitRecord[];
  step: TrainDownValUpStep;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${path}: 유한한 수가 아니다`);
  return v;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`${path}: 객체가 아니다`);
  return v as Record<string, unknown>;
}

function readFit(raw: unknown, path: string): FitRecord {
  const r = obj(raw, path);
  const degree = num(r.degree, `${path}.degree`);
  if (!Array.isArray(r.coef) || r.coef.length !== degree + 1) {
    throw new Error(`${path}.coef: 길이가 차수 + 1 인 배열이어야 한다`);
  }
  const coef = r.coef.map((c, i) => num(c, `${path}.coef[${i}]`));
  return {
    degree,
    coef,
    trainMse: num(r.trainMse, `${path}.trainMse`),
    valMse: num(r.valMse, `${path}.valMse`),
    lowDegree: num(r.lowDegree, `${path}.lowDegree`),
  };
}

/** 실린 바닥 차수가 자취와 맞는지 대조한다 — 차수 0 부터 이 차수까지 검증 MSE 가 가장 낮은 곳 */
function checkLow(fits: readonly FitRecord[], path: string): void {
  let low = 0;
  fits.forEach((f, i) => {
    if (f.valMse < fits[low]!.valMse) low = i;
  });
  const last = fits[fits.length - 1]!;
  if (last.lowDegree !== low) throw new Error(`${path}.lowDegree: 자취의 바닥은 ${low} 인데 ${last.lowDegree} 가 실렸다`);
}

function readRange(raw: unknown, path: string): FitRange {
  const r = obj(raw, path);
  const range = {
    xMin: num(r.xMin, `${path}.xMin`),
    xMax: num(r.xMax, `${path}.xMax`),
    yMin: num(r.yMin, `${path}.yMin`),
    yMax: num(r.yMax, `${path}.yMax`),
    mseMax: num(r.mseMax, `${path}.mseMax`),
  };
  if (!(range.xMax > range.xMin) || !(range.yMax > range.yMin) || !(range.mseMax > 0)) {
    throw new Error(`${path}: 범위가 비었다`);
  }
  return range;
}

export const trainDownValUpScene: ScenePlan<TrainDownValUpScene> = {
  initial(initialData: unknown): TrainDownValUpScene {
    const data = readTrainDownValUpData(initialData);
    return {
      train: data.train.map((p) => ({ x: p.x, y: p.y })),
      validation: data.validation.map((p) => ({ x: p.x, y: p.y })),
      maxDegree: data.maxDegree,
      range: null,
      fits: [],
      step: null,
    };
  },

  reduce(scene: TrainDownValUpScene, event: FacetRuntimeEvent): TrainDownValUpScene {
    switch (event.type) {
      case 'init': {
        const p = obj(event.payload, 'init.payload');
        const range = readRange(p.range, 'init.payload.range');
        const fit = readFit(p.fit, 'init.payload.fit');
        if (fit.degree !== 0) throw new Error(`init.payload.fit.degree: 0 이어야 한다 (${fit.degree})`);
        checkLow([fit], 'init.payload.fit');
        return { ...scene, range, fits: [fit], step: null };
      }
      case 'fit': {
        if (scene.range === null) throw new Error('fit: init 앞에 왔다');
        const fit = readFit(event.payload, 'fit.payload');
        const expected = scene.fits.length;
        if (fit.degree !== expected) throw new Error(`fit.payload.degree: ${expected} 이어야 한다 (${fit.degree})`);
        if (fit.degree > scene.maxDegree) throw new Error(`fit.payload.degree: 마지막 차수 ${scene.maxDegree} 를 넘었다`);
        const from = scene.fits[expected - 1];
        if (from === undefined) throw new Error('fit: 앞 차수의 맞춤이 없다');
        const fits = [...scene.fits, fit];
        checkLow(fits, 'fit.payload');
        return { ...scene, fits, step: { kind: 'raise', degree: fit.degree, from } };
      }
      default:
        throw new Error(`train-down-val-up: 모르는 이벤트 '${event.type}'`);
    }
  },
};
