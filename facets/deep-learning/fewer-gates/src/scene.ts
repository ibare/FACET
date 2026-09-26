/**
 * fewer-gates 장면.
 *
 * 바탕 — 입력 차례 · 기호 · 모형 이름 · 두 모형의 짜임(문 · 상태 · 무게의 수) · 처음 상태
 * 자취 — 걸음마다 셈한 값 (`steps`)
 * 이번 걸음 — 처음이거나, 앞 걸음의 문 값(`from`)에서 이번 값으로 나아가는 걸음
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { modelShape, readFewerGatesData, type Shape } from './algorithm.js';

export type LstmRec = {
  f: number;
  i: number;
  g: number;
  o: number;
  cPrev: number;
  c: number;
  kept: number;
  taken: number;
  hPrev: number;
  h: number;
  sum: number;
};

export type GruRec = {
  z: number;
  rest: number;
  r: number;
  cand: number;
  hPrev: number;
  h: number;
  kept: number;
  taken: number;
  sum: number;
};

export type StepRec = {
  k: number;
  x: number;
  lstm: LstmRec;
  gru: GruRec;
  evals: { lstm: number; gru: number };
};

export type FewerGatesBase = {
  inputs: number[];
  names: { lstm: string; gru: string };
  symbols: {
    x: string;
    c: string;
    h: string;
    f: string;
    i: string;
    g: string;
    o: string;
    z: string;
    rest: string;
    r: string;
    cand: string;
  };
  shape: { lstm: Shape; gru: Shape };
  start: { c: number; hl: number; hg: number };
};

export type FewerGatesStep =
  | { kind: 'start' }
  | { kind: 'advance'; k: number; from: { f: number; i: number; z: number } | null };

export type FewerGatesScene = {
  base: FewerGatesBase;
  steps: StepRec[];
  step: FewerGatesStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`fewer-gates 장면: ${where}.${key} 가 수가 아니다`);
  }
  return v;
}

function rec(o: Record<string, unknown>, key: string, where: string): Record<string, unknown> {
  const v = o[key];
  if (!isRecord(v)) throw new Error(`fewer-gates 장면: ${where}.${key} 가 객체가 아니다`);
  return v;
}

function readStep(payload: unknown): StepRec {
  if (!isRecord(payload)) throw new Error('fewer-gates 장면: step 의 payload 가 객체가 아니다');
  const l = rec(payload, 'lstm', 'step');
  const g = rec(payload, 'gru', 'step');
  const e = rec(payload, 'evals', 'step');
  return {
    k: num(payload, 'k', 'step'),
    x: num(payload, 'x', 'step'),
    lstm: {
      f: num(l, 'f', 'lstm'),
      i: num(l, 'i', 'lstm'),
      g: num(l, 'g', 'lstm'),
      o: num(l, 'o', 'lstm'),
      cPrev: num(l, 'cPrev', 'lstm'),
      c: num(l, 'c', 'lstm'),
      kept: num(l, 'kept', 'lstm'),
      taken: num(l, 'taken', 'lstm'),
      hPrev: num(l, 'hPrev', 'lstm'),
      h: num(l, 'h', 'lstm'),
      sum: num(l, 'sum', 'lstm'),
    },
    gru: {
      z: num(g, 'z', 'gru'),
      rest: num(g, 'rest', 'gru'),
      r: num(g, 'r', 'gru'),
      cand: num(g, 'cand', 'gru'),
      hPrev: num(g, 'hPrev', 'gru'),
      h: num(g, 'h', 'gru'),
      kept: num(g, 'kept', 'gru'),
      taken: num(g, 'taken', 'gru'),
      sum: num(g, 'sum', 'gru'),
    },
    evals: { lstm: num(e, 'lstm', 'evals'), gru: num(e, 'gru', 'evals') },
  };
}

export const fewerGatesScene: ScenePlan<FewerGatesScene> = {
  initial(initialData: unknown): FewerGatesScene {
    const data = readFewerGatesData(initialData);
    const shape = modelShape(data);
    return {
      base: {
        inputs: [...data.inputs],
        names: { lstm: data.lstm.name, gru: data.gru.name },
        symbols: { ...data.symbols },
        shape: { lstm: { ...shape.lstm }, gru: { ...shape.gru } },
        start: { c: data.lstm.c0, hl: data.lstm.h0, hg: data.gru.h0 },
      },
      steps: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: FewerGatesScene, event: FacetRuntimeEvent): FewerGatesScene {
    if (event.type !== 'step') {
      throw new Error(`fewer-gates 장면: 모르는 이벤트 ${event.type}`);
    }
    const next = readStep(event.payload);
    const last = scene.steps[scene.steps.length - 1];
    return {
      base: scene.base,
      steps: [...scene.steps, next],
      step: {
        kind: 'advance',
        k: next.k,
        from: last === undefined ? null : { f: last.lstm.f, i: last.lstm.i, z: last.gru.z },
      },
    };
  },
};
