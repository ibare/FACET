/**
 * weighted-sum-threshold 의 장면.
 *
 * 바탕 — 입력 · 무게 · 문턱 (initialData 에서 베낀다), 합 눈금 · 출발 합 · 출발 출력 (silent init)
 * 자취 — 실린 입력들 (loads), 견줌의 판정 (verdict)
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowWeightedSumThresholdData,
  type SumAxis,
  type WeightedInput,
} from './algorithm.js';

export type WeightedLoad = { index: number; product: number; from: number; to: number };

export type WeightedVerdict = {
  sum: number;
  theta: number;
  margin: number;
  above: boolean;
  from: number;
  to: number;
};

export type WeightedStep =
  | { kind: 'start' }
  | { kind: 'load'; index: number }
  | { kind: 'compare' };

export type WeightedSumThresholdScene = {
  inputs: WeightedInput[];
  theta: number;
  /** init 이 오기 전에는 null — 셈으로 나올 바탕이다 */
  axis: SumAxis | null;
  sum: number | null;
  output: number | null;
  loads: WeightedLoad[];
  verdict: WeightedVerdict | null;
  step: WeightedStep;
};

function fail(path: string, why: string): never {
  throw new Error(`weightedSumThresholdScene: ${path} — ${why}`);
}

function field(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) fail(`${type}.payload`, '객체가 아니다');
  return payload as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, type: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key}`, '유한한 수가 아니다');
  return v;
}

function readAxis(raw: unknown): SumAxis {
  if (typeof raw !== 'object' || raw === null) fail('init.payload.axis', '객체가 아니다');
  const o = raw as Record<string, unknown>;
  const lo = num(o, 'lo', 'init.axis');
  const hi = num(o, 'hi', 'init.axis');
  if (!(hi > lo)) fail('init.payload.axis', 'hi 가 lo 보다 커야 한다');
  if (!Array.isArray(o.ticks)) fail('init.payload.axis.ticks', '배열이 아니다');
  const ticks = o.ticks.map((tk: unknown, i: number) => {
    if (typeof tk !== 'object' || tk === null) fail(`init.payload.axis.ticks[${i}]`, '객체가 아니다');
    const r = tk as Record<string, unknown>;
    const v = num(r, 'v', `init.axis.ticks[${i}]`);
    if (typeof r.major !== 'boolean') fail(`init.payload.axis.ticks[${i}].major`, '참거짓이 아니다');
    return { v, major: r.major };
  });
  return { lo, hi, ticks };
}

export const weightedSumThresholdScene: ScenePlan<WeightedSumThresholdScene> = {
  initial(initialData: unknown): WeightedSumThresholdScene {
    const data = narrowWeightedSumThresholdData(initialData);
    return {
      inputs: data.inputs.map((it) => ({ ...it })),
      theta: data.theta,
      axis: null,
      sum: null,
      output: null,
      loads: [],
      verdict: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: WeightedSumThresholdScene, event: FacetRuntimeEvent): WeightedSumThresholdScene {
    switch (event.type) {
      case 'init': {
        const p = field(event.payload, 'init');
        return {
          ...scene,
          axis: readAxis(p.axis),
          sum: num(p, 'sum', 'init'),
          output: num(p, 'output', 'init'),
          loads: [],
          verdict: null,
          step: { kind: 'start' },
        };
      }
      case 'load': {
        const p = field(event.payload, 'load');
        const index = num(p, 'index', 'load');
        const product = num(p, 'product', 'load');
        const from = num(p, 'from', 'load');
        const to = num(p, 'to', 'load');
        if (scene.sum === null) fail('load', 'init 앞에 왔다');
        if (index !== scene.loads.length) fail('load.payload.index', `다음 차례는 ${scene.loads.length} 이다`);
        if (scene.inputs[index] === undefined) fail('load.payload.index', '없는 입력이다');
        if (from !== scene.sum) fail('load.payload.from', '지금 합과 다르다');
        return {
          ...scene,
          sum: to,
          loads: [...scene.loads, { index, product, from, to }],
          step: { kind: 'load', index },
        };
      }
      case 'compare': {
        const p = field(event.payload, 'compare');
        const sum = num(p, 'sum', 'compare');
        const theta = num(p, 'theta', 'compare');
        const margin = num(p, 'margin', 'compare');
        const from = num(p, 'from', 'compare');
        const to = num(p, 'to', 'compare');
        if (typeof p.above !== 'boolean') fail('compare.payload.above', '참거짓이 아니다');
        if (scene.loads.length !== scene.inputs.length) fail('compare', '입력이 다 실리기 전에 왔다');
        if (sum !== scene.sum) fail('compare.payload.sum', '지금 합과 다르다');
        if (theta !== scene.theta) fail('compare.payload.theta', '바탕의 문턱과 다르다');
        if (from !== scene.output) fail('compare.payload.from', '지금 출력과 다르다');
        return {
          ...scene,
          output: to,
          verdict: { sum, theta, margin, above: p.above, from, to },
          step: { kind: 'compare' },
        };
      }
      default:
        throw new Error(`weightedSumThresholdScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
