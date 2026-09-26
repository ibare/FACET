/**
 * gateLetsThrough 의 장면. 셈은 알고리즘이 한다 — 장면은 이벤트를 잇기만 한다.
 *
 * 바탕: 이번 걸음의 입력 (x · h_prev · c_prev · 무게). initial() 이 initialData 에서 베낀다.
 * 자취: 문마다 열린 뒤의 값. 한 번 열린 문은 그대로 남는다.
 * 이번 걸음: step — 어느 흐름이 방금 문을 지났는가.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { GATE_IDS, readGateData, type GateId, type GateWeights } from './algorithm.js';

export type GateBase = {
  x: number;
  hPrev: number;
  cPrev: number;
  weights: Record<GateId, GateWeights>;
};

export type ForgetTrace = { pre: number; f: number; kept: number; dropped: number };
export type CandidateTrace = { pre: number; g: number };
export type AdmitTrace = { pre: number; i: number; admitted: number };
export type CombineTrace = { kept: number; admitted: number; c: number };
export type OutputTrace = { pre: number; o: number; tc: number; h: number };

export type GateStepKind = 'forget' | 'candidate' | 'admit' | 'combine' | 'output';

export type GateLetsThroughScene = {
  base: GateBase;
  forget: ForgetTrace | null;
  candidate: CandidateTrace | null;
  admit: AdmitTrace | null;
  combine: CombineTrace | null;
  output: OutputTrace | null;
  step: GateStepKind | null;
};

/** payload 의 한 필드를 수로 좁힌다. 없거나 수가 아니면 던진다. */
function num(payload: unknown, key: string, type: string): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`gateLetsThroughScene: ${type} 의 payload 가 없다`);
  }
  const v = (payload as Record<string, unknown>)[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`gateLetsThroughScene: ${type}.${key} 가 수가 아니다`);
  }
  return v;
}

export const gateLetsThroughScene: ScenePlan<GateLetsThroughScene> = {
  initial(initialData: unknown): GateLetsThroughScene {
    const d = readGateData(initialData);
    const weights = {} as Record<GateId, GateWeights>;
    for (const id of GATE_IDS) {
      const [wx, wh, b] = d.weights[id];
      weights[id] = [wx, wh, b];
    }
    return {
      base: { x: d.x, hPrev: d.hPrev, cPrev: d.cPrev, weights },
      forget: null,
      candidate: null,
      admit: null,
      combine: null,
      output: null,
      step: null,
    };
  },

  reduce(scene: GateLetsThroughScene, event: FacetRuntimeEvent): GateLetsThroughScene {
    const p = event.payload;
    switch (event.type) {
      case 'forget':
        return {
          ...scene,
          forget: {
            pre: num(p, 'pre', 'forget'),
            f: num(p, 'f', 'forget'),
            kept: num(p, 'kept', 'forget'),
            dropped: num(p, 'dropped', 'forget'),
          },
          step: 'forget',
        };
      case 'candidate':
        return {
          ...scene,
          candidate: { pre: num(p, 'pre', 'candidate'), g: num(p, 'g', 'candidate') },
          step: 'candidate',
        };
      case 'admit':
        return {
          ...scene,
          admit: {
            pre: num(p, 'pre', 'admit'),
            i: num(p, 'i', 'admit'),
            admitted: num(p, 'admitted', 'admit'),
          },
          step: 'admit',
        };
      case 'combine':
        return {
          ...scene,
          combine: {
            kept: num(p, 'kept', 'combine'),
            admitted: num(p, 'admitted', 'combine'),
            c: num(p, 'c', 'combine'),
          },
          step: 'combine',
        };
      case 'output':
        return {
          ...scene,
          output: {
            pre: num(p, 'pre', 'output'),
            o: num(p, 'o', 'output'),
            tc: num(p, 'tc', 'output'),
            h: num(p, 'h', 'output'),
          },
          step: 'output',
        };
      default:
        throw new Error(`gateLetsThroughScene: 모르는 이벤트 (${event.type})`);
    }
  },
};
