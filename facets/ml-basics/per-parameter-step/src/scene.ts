/**
 * per-parameter-step 의 장면.
 *
 * - 바탕 — 기호 둘 · η · 로그 축 범위(silent `init` 이 채운다)
 * - 자취 — 지금 무게
 * - 이번 걸음 — 이 걸음의 갱신 한 번(기울기 · 보폭 · 움직임 · 대조 수)과, 기울기 표시가 흘러 나올 자리
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPerParameterStepData, type Pair } from './algorithm.js';

export type PerParameterStepShown = {
  t: number;
  g: Pair;
  plain: Pair;
  rate: Pair;
  move: Pair;
  ratio: number;
};

export type PerParameterStepScene = {
  base: {
    ids: readonly [string, string];
    eta: number;
    /** 로그 축의 십진 자리 범위 — silent init 전에는 없다 */
    range: { lo: number; hi: number } | null;
  };
  weights: Pair;
  /** 이번 걸음의 갱신. 걸음 0 에는 없다 */
  update: PerParameterStepShown | null;
  step:
    | { kind: 'start' }
    | {
        kind: 'update';
        t: number;
        /** 앞 갱신의 기울기 — 기울기 표시가 거기서 흘러온다. 첫 갱신이면 null */
        gFrom: Pair | null;
      };
};

function field(p: Record<string, unknown>, key: string): unknown {
  if (!(key in p)) throw new Error(`per-parameter-step 장면: payload.${key} 가 없다`);
  return p[key];
}

function num(p: Record<string, unknown>, key: string): number {
  const v = field(p, key);
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`per-parameter-step 장면: payload.${key} 는 유한한 수여야 한다`);
  }
  return v;
}

function pair(p: Record<string, unknown>, key: string): Pair {
  const v = field(p, key);
  if (!Array.isArray(v) || v.length !== 2) {
    throw new Error(`per-parameter-step 장면: payload.${key} 는 수 둘의 배열이어야 한다`);
  }
  const [x, y] = v as unknown[];
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error(`per-parameter-step 장면: payload.${key} 의 원소가 유한한 수가 아니다`);
  }
  return [x, y];
}

function positive(v: Pair, key: string): Pair {
  if (!(v[0] > 0 && v[1] > 0)) throw new Error(`per-parameter-step 장면: payload.${key} 는 로그 축에 오르도록 0 보다 커야 한다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`per-parameter-step 장면: ${event.type} 의 payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

export const perParameterStepScene: ScenePlan<PerParameterStepScene> = {
  initial(initialData: unknown): PerParameterStepScene {
    const data = narrowPerParameterStepData(initialData);
    const [wa, wb] = data.weights;
    return {
      base: { ids: [wa.id, wb.id], eta: data.eta, range: null },
      weights: [wa.start, wb.start],
      update: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: PerParameterStepScene, event: FacetRuntimeEvent): PerParameterStepScene {
    switch (event.type) {
      case 'init': {
        if (scene.base.range !== null) throw new Error('per-parameter-step 장면: init 이 두 번 왔다');
        const p = payloadOf(event);
        const lo = num(p, 'lo');
        const hi = num(p, 'hi');
        if (!Number.isInteger(lo) || !Number.isInteger(hi) || !(lo < hi)) {
          throw new Error(`per-parameter-step 장면: payload.lo · hi 는 lo < hi 인 정수여야 한다 (${lo}, ${hi})`);
        }
        const e = Math.log10(scene.base.eta);
        if (e < lo || e > hi) throw new Error('per-parameter-step 장면: η 가 축 범위 밖이다');
        return { ...scene, base: { ...scene.base, range: { lo, hi } } };
      }
      case 'update': {
        const range = scene.base.range;
        if (range === null) throw new Error('per-parameter-step 장면: init 전에 update 가 왔다');
        const p = payloadOf(event);
        const t = num(p, 't');
        const expected = (scene.update?.t ?? 0) + 1;
        if (t !== expected) throw new Error(`per-parameter-step 장면: payload.t 는 ${expected} 여야 한다 (받은 값 ${t})`);
        const before = pair(p, 'before');
        if (before[0] !== scene.weights[0] || before[1] !== scene.weights[1]) {
          throw new Error('per-parameter-step 장면: payload.before 가 지금 무게와 다르다');
        }
        const shown: PerParameterStepShown = {
          t,
          g: positive(pair(p, 'g'), 'g'),
          plain: positive(pair(p, 'plain'), 'plain'),
          rate: positive(pair(p, 'rate'), 'rate'),
          move: positive(pair(p, 'move'), 'move'),
          ratio: num(p, 'ratio'),
        };
        for (const key of ['g', 'plain', 'rate', 'move'] as const) {
          for (const x of shown[key]) {
            const d = Math.log10(x);
            if (d < range.lo || d > range.hi) {
              throw new Error(`per-parameter-step 장면: 갱신 ${t} 의 payload.${key} = ${x} 가 축 범위 밖이다`);
            }
          }
        }
        const after = pair(p, 'after');
        return {
          base: scene.base,
          weights: after,
          update: shown,
          step: { kind: 'update', t, gFrom: scene.update === null ? null : scene.update.g },
        };
      }
      default:
        throw new Error(`per-parameter-step 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
