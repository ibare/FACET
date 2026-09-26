/**
 * easy-one-way-hard-back 의 장면.
 *
 * 바탕  p · q (initialData) · candidates · 두 계수기 (silent init)
 * 자취  n (곱셈이 낸 값) · trials (쌓인 나눗셈) · recovered (되찾은 두 소수)
 * 이번  step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowEasyOneWayHardBackData } from './algorithm.js';

export type Trial = { d: number; r: number };

export type EasyOneWayHardBackStep =
  | { kind: 'start' }
  | { kind: 'multiply' }
  | { kind: 'divide'; d: number; r: number }
  | { kind: 'found'; d: number; e: number; r: number };

export type EasyOneWayHardBackScene = {
  p: number;
  q: number;
  /** 돌아오는 쪽이 차례로 나눠 볼 소수. init 전에는 null. */
  candidates: number[] | null;
  multiplications: number | null;
  divisions: number | null;
  n: number | null;
  trials: Trial[];
  recovered: { d: number; e: number } | null;
  step: EasyOneWayHardBackStep;
};

function field(payload: unknown, key: string, type: string): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`easy-one-way-hard-back 장면: ${type}.payload 가 객체가 아니다`);
  }
  const v = (payload as Record<string, unknown>)[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`easy-one-way-hard-back 장면: ${type}.payload.${key} 가 수가 아니다`);
  }
  return v;
}

function numberList(payload: unknown, key: string, type: string): number[] {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`easy-one-way-hard-back 장면: ${type}.payload 가 객체가 아니다`);
  }
  const v = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) {
    throw new Error(`easy-one-way-hard-back 장면: ${type}.payload.${key} 가 수 목록이 아니다`);
  }
  return v.map((x: number) => x);
}

function expect(cond: boolean, message: string): void {
  if (!cond) throw new Error(`easy-one-way-hard-back 장면: ${message}`);
}

/** 나눗셈 한 걸음이 앞 장면과 맞는지 본다. */
function checkDivision(scene: EasyOneWayHardBackScene, type: string, n: number, d: number, divisions: number): void {
  expect(scene.n !== null && scene.n === n, `${type}.payload.n 이 곱셈이 낸 값과 다르다`);
  expect(scene.recovered === null, `${type} 가 되찾은 뒤에 왔다`);
  expect(scene.candidates !== null, `${type} 가 init 앞에 왔다`);
  const next = scene.candidates?.[scene.trials.length];
  expect(next === d, `${type}.payload.d 가 다음 후보와 다르다`);
  expect(divisions === scene.trials.length + 1, `${type}.payload.divisions 가 쌓인 수와 맞지 않다`);
}

export const easyOneWayHardBackScene: ScenePlan<EasyOneWayHardBackScene> = {
  initial(initialData: unknown): EasyOneWayHardBackScene {
    const { p, q } = narrowEasyOneWayHardBackData(initialData);
    return {
      p,
      q,
      candidates: null,
      multiplications: null,
      divisions: null,
      n: null,
      trials: [],
      recovered: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EasyOneWayHardBackScene, event: FacetRuntimeEvent): EasyOneWayHardBackScene {
    const { type, payload } = event;
    switch (type) {
      case 'init': {
        const p = field(payload, 'p', type);
        const q = field(payload, 'q', type);
        expect(p === scene.p && q === scene.q, 'init.payload 의 p · q 가 바탕과 다르다');
        return {
          ...scene,
          candidates: numberList(payload, 'candidates', type),
          multiplications: field(payload, 'multiplications', type),
          divisions: field(payload, 'divisions', type),
          trials: [],
          step: { kind: 'start' },
        };
      }
      case 'multiply': {
        const p = field(payload, 'p', type);
        const q = field(payload, 'q', type);
        expect(p === scene.p && q === scene.q, 'multiply.payload 의 p · q 가 바탕과 다르다');
        expect(scene.n === null, 'multiply 가 두 번 왔다');
        return {
          ...scene,
          n: field(payload, 'n', type),
          multiplications: field(payload, 'multiplications', type),
          trials: [...scene.trials],
          step: { kind: 'multiply' },
        };
      }
      case 'divide': {
        const n = field(payload, 'n', type);
        const d = field(payload, 'd', type);
        const r = field(payload, 'r', type);
        const divisions = field(payload, 'divisions', type);
        checkDivision(scene, type, n, d, divisions);
        expect(r !== 0, 'divide.payload.r 가 0 이다 — found 로 와야 한다');
        return {
          ...scene,
          divisions,
          trials: [...scene.trials, { d, r }],
          step: { kind: 'divide', d, r },
        };
      }
      case 'found': {
        const n = field(payload, 'n', type);
        const d = field(payload, 'd', type);
        const e = field(payload, 'e', type);
        const r = field(payload, 'r', type);
        const divisions = field(payload, 'divisions', type);
        checkDivision(scene, type, n, d, divisions);
        expect(r === 0, 'found.payload.r 가 0 이 아니다');
        return {
          ...scene,
          divisions,
          trials: [...scene.trials, { d, r }],
          recovered: { d, e },
          step: { kind: 'found', d, e, r },
        };
      }
      default:
        throw new Error(`easy-one-way-hard-back 장면: 모르는 이벤트 ${type}`);
    }
  },
};
