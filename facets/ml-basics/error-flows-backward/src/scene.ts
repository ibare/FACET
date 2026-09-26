/**
 * error-flows-backward 장면.
 *
 * 바탕 — 망의 구조(x · W1 · w2 · y)와 앞으로 셈(forward, silent 이벤트가 채운다)
 * 자취 — 출력의 틀림 · 은닉에 닿은 몫 · 무게마다의 기울기. 걸음이 쌓는다
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readErrorFlowsData } from './algorithm.js';

export type ErrorFlowsForward = {
  z: number[];
  h: number[];
  yhat: number;
  loss: number;
};

export type ErrorFlowsStep = 'none' | 'error' | 'toHidden' | 'toInputs';

export type ErrorFlowsBackwardScene = {
  x: number[];
  W1: number[][];
  w2: number[];
  y: number;
  forward: ErrorFlowsForward | null;
  deltaOut: number | null;
  deltaHidden: number[] | null;
  gradW2: number[] | null;
  flipped: number[] | null;
  gradW1: number[][] | null;
  step: ErrorFlowsStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${path} 가 수가 아니다`);
  return v;
}

function nums(v: unknown, length: number, path: string): number[] {
  if (!Array.isArray(v) || v.length !== length) throw new Error(`${path} 는 길이 ${length} 의 배열이어야 한다`);
  return v.map((q, k) => num(q, `${path}[${k}]`));
}

export const errorFlowsBackwardScene: ScenePlan<ErrorFlowsBackwardScene> = {
  initial(initialData: unknown): ErrorFlowsBackwardScene {
    const d = readErrorFlowsData(initialData);
    return {
      x: [...d.x],
      W1: d.W1.map((row) => [...row]),
      w2: [...d.w2],
      y: d.y,
      forward: null,
      deltaOut: null,
      deltaHidden: null,
      gradW2: null,
      flipped: null,
      gradW1: null,
      step: 'none',
    };
  },

  reduce(scene, event) {
    const hidden = scene.w2.length;
    const inputs = scene.x.length;
    switch (event.type) {
      case 'forward': {
        if (scene.forward !== null) throw new Error('forward 가 두 번 왔다');
        const p = payloadOf(event);
        return {
          ...scene,
          forward: {
            z: nums(p.z, hidden, 'forward.z'),
            h: nums(p.h, hidden, 'forward.h'),
            yhat: num(p.yhat, 'forward.yhat'),
            loss: num(p.loss, 'forward.loss'),
          },
          step: 'none',
        };
      }
      case 'error': {
        if (scene.forward === null) throw new Error('error 가 forward 보다 먼저 왔다');
        if (scene.deltaOut !== null) throw new Error('error 가 두 번 왔다');
        const p = payloadOf(event);
        return { ...scene, deltaOut: num(p.deltaOut, 'error.deltaOut'), step: 'error' };
      }
      case 'toHidden': {
        if (scene.deltaOut === null) throw new Error('toHidden 이 error 보다 먼저 왔다');
        if (scene.deltaHidden !== null) throw new Error('toHidden 이 두 번 왔다');
        const p = payloadOf(event);
        if (!Array.isArray(p.flipped)) throw new Error('toHidden.flipped 가 배열이 아니다');
        const flipped = p.flipped.map((q, k) => {
          const j = num(q, `toHidden.flipped[${k}]`);
          if (!Number.isInteger(j) || j < 0 || j >= hidden) throw new Error(`toHidden.flipped[${k}] 가 은닉 자리가 아니다`);
          return j;
        });
        return {
          ...scene,
          deltaHidden: nums(p.deltaHidden, hidden, 'toHidden.deltaHidden'),
          gradW2: nums(p.gradW2, hidden, 'toHidden.gradW2'),
          flipped,
          step: 'toHidden',
        };
      }
      case 'toInputs': {
        if (scene.deltaHidden === null) throw new Error('toInputs 가 toHidden 보다 먼저 왔다');
        if (scene.gradW1 !== null) throw new Error('toInputs 가 두 번 왔다');
        const p = payloadOf(event);
        if (!Array.isArray(p.gradW1) || p.gradW1.length !== hidden) {
          throw new Error(`toInputs.gradW1 은 줄 ${hidden} 의 배열이어야 한다`);
        }
        const gradW1 = p.gradW1.map((row, j) => nums(row, inputs, `toInputs.gradW1[${j}]`));
        return { ...scene, gradW1, step: 'toInputs' };
      }
      default:
        throw new Error(`error-flows-backward 장면이 모르는 이벤트: ${event.type}`);
    }
  },
};
