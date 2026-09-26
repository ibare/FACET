/**
 * unroll-then-backprop 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: 펼친 셀의 입력 · 무게 · 처음 상태 · 목표 · 기호 (initialData 에서 베낀다)
 * 자취: 앞으로 셈한 h 들 · 손실 · 뒤로 보탠 몫들 · 모인 합
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowUnrollData, type UnrollSymbols } from './algorithm.js';

export type UnrollBase = {
  xs: number[];
  wx: number;
  wh: number;
  b: number;
  h0: number;
  y: number;
  symbols: UnrollSymbols;
};

/** 뒤로 한 걸음이 남긴 것. */
export type UnrollBackEntry = {
  t: number;
  delta: number;
  slope: number;
  d: number;
  share: number;
};

export type UnrollStep =
  | { kind: 'start' }
  | { kind: 'forward'; t: number }
  | { kind: 'loss' }
  /** slot = 기울기 칸에서 이 몫이 앉는 자리 (보탠 차례) · before = 보태기 전의 합 */
  | { kind: 'backward'; t: number; slot: number; before: number };

export type UnrollScene = {
  base: UnrollBase;
  /** h_1..h_T. 아직 셈하지 않았으면 null */
  hs: Array<number | null>;
  loss: { value: number; delta: number } | null;
  /** 보탠 차례대로 (t = T → 1) */
  back: UnrollBackEntry[];
  /** 지금까지 모인 w_x 의 기울기 (몫이 없으면 빈 합 0) */
  sum: number;
  step: UnrollStep;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`unroll-then-backprop 장면: ${type} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    throw new Error(`unroll-then-backprop 장면: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function stepIndex(scene: UnrollScene, t: number, type: string): number {
  if (!Number.isInteger(t) || t < 1 || t > scene.hs.length) {
    throw new Error(`unroll-then-backprop 장면: ${type} 의 걸음 ${t} 가 펼친 셀 밖이다`);
  }
  return t - 1;
}

export const unrollThenBackpropScene: ScenePlan<UnrollScene> = {
  initial(initialData: unknown): UnrollScene {
    const data = narrowUnrollData(initialData);
    return {
      base: {
        xs: [...data.xs],
        wx: data.wx,
        wh: data.wh,
        b: data.b,
        h0: data.h0,
        y: data.y,
        symbols: { ...data.symbols },
      },
      hs: data.xs.map(() => null),
      loss: null,
      back: [],
      sum: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: UnrollScene, event: FacetRuntimeEvent): UnrollScene {
    switch (event.type) {
      case 'forward': {
        const p = payloadOf(event);
        const t = num(p, 't', 'forward');
        const i = stepIndex(scene, t, 'forward');
        const hs = [...scene.hs];
        hs[i] = num(p, 'h', 'forward');
        return { ...scene, hs, step: { kind: 'forward', t } };
      }
      case 'loss': {
        const p = payloadOf(event);
        return {
          ...scene,
          loss: { value: num(p, 'loss', 'loss'), delta: num(p, 'delta', 'loss') },
          step: { kind: 'loss' },
        };
      }
      case 'backward': {
        const p = payloadOf(event);
        const t = num(p, 't', 'backward');
        stepIndex(scene, t, 'backward');
        const entry: UnrollBackEntry = {
          t,
          delta: num(p, 'delta', 'backward'),
          slope: num(p, 'slope', 'backward'),
          d: num(p, 'd', 'backward'),
          share: num(p, 'share', 'backward'),
        };
        return {
          ...scene,
          back: [...scene.back, entry],
          sum: num(p, 'sum', 'backward'),
          step: { kind: 'backward', t, slot: scene.back.length, before: scene.sum },
        };
      }
      default:
        throw new Error(`unroll-then-backprop 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
