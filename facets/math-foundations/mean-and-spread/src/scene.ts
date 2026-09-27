/**
 * mean-and-spread 장면.
 *
 * 바탕   values(initialData 에서 베낌) · frame(silent init — 수의 줄 범위)
 * 자취   mean · devs · squares · variance · spread — 걸음마다 하나씩 채워지고 지워지지 않는다
 * 이번   step — 지금 걸음이 무엇을 드러냈는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowMeanAndSpreadData } from './algorithm.js';

export type MeanAndSpreadStep = 'values' | 'mean' | 'deviations' | 'squares' | 'variance' | 'spread';

export type MeanAndSpreadScene = {
  readonly values: readonly number[];
  readonly frame: { readonly lo: number; readonly hi: number; readonly maxSide: number } | null;
  readonly mean: { readonly sum: number; readonly n: number; readonly mean: number } | null;
  readonly devs: {
    readonly dev: readonly number[];
    readonly from: readonly number[];
    readonly to: readonly number[];
    readonly left: number;
    readonly right: number;
    readonly total: number;
  } | null;
  readonly squares: { readonly sq: readonly number[]; readonly ss: number; readonly far: number } | null;
  readonly variance: { readonly ss: number; readonly n: number; readonly variance: number; readonly side: number } | null;
  readonly spread: {
    readonly variance: number;
    readonly sd: number;
    readonly bandLo: number;
    readonly bandHi: number;
    readonly inside: readonly number[];
  } | null;
  readonly step: MeanAndSpreadStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`meanAndSpreadScene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`meanAndSpreadScene: ${where}.payload.${key} 가 유한한 수가 아니다`);
  }
  return v;
}

function nums(p: Record<string, unknown>, key: string, where: string, length: number): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`meanAndSpreadScene: ${where}.payload.${key} 가 배열이 아니다`);
  if (v.length !== length) {
    throw new Error(`meanAndSpreadScene: ${where}.payload.${key} 의 길이 ${v.length} 가 값의 수 ${length} 와 다르다`);
  }
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`meanAndSpreadScene: ${where}.payload.${key}[${i}] 가 유한한 수가 아니다`);
    }
    return x;
  });
}

function indices(p: Record<string, unknown>, key: string, where: string, count: number): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`meanAndSpreadScene: ${where}.payload.${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= count) {
      throw new Error(`meanAndSpreadScene: ${where}.payload.${key}[${i}] 가 값의 자리가 아니다`);
    }
    return x;
  });
}

function need<T>(part: T | null, what: string, where: string): T {
  if (part === null) throw new Error(`meanAndSpreadScene: ${where} 가 ${what} 보다 먼저 왔다`);
  return part;
}

export const meanAndSpreadScene: ScenePlan<MeanAndSpreadScene> = {
  initial(initialData: unknown): MeanAndSpreadScene {
    const data = narrowMeanAndSpreadData(initialData);
    return {
      values: [...data.values],
      frame: null,
      mean: null,
      devs: null,
      squares: null,
      variance: null,
      spread: null,
      step: 'values',
    };
  },

  reduce(scene: MeanAndSpreadScene, event: FacetRuntimeEvent): MeanAndSpreadScene {
    const n = scene.values.length;
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const lo = num(p, 'lo', 'init');
        const hi = num(p, 'hi', 'init');
        const maxSide = num(p, 'maxSide', 'init');
        if (!(hi > lo)) throw new Error('meanAndSpreadScene: init.payload 의 hi 가 lo 보다 크지 않다');
        for (const v of scene.values) {
          if (v < lo || v > hi) throw new Error(`meanAndSpreadScene: 값 ${v} 가 init 범위 밖이다`);
        }
        return { ...scene, frame: { lo, hi, maxSide }, step: 'values' };
      }
      case 'mean': {
        need(scene.frame, 'init', 'mean');
        const p = payloadOf(event);
        const got = { sum: num(p, 'sum', 'mean'), n: num(p, 'n', 'mean'), mean: num(p, 'mean', 'mean') };
        if (got.n !== n) throw new Error(`meanAndSpreadScene: mean.payload.n ${got.n} 가 값의 수 ${n} 와 다르다`);
        return { ...scene, mean: got, step: 'mean' };
      }
      case 'deviations': {
        need(scene.mean, 'mean', 'deviations');
        const frame = need(scene.frame, 'init', 'deviations');
        const p = payloadOf(event);
        const dev = nums(p, 'dev', 'deviations', n);
        const from = nums(p, 'from', 'deviations', n);
        const to = nums(p, 'to', 'deviations', n);
        from.forEach((f, i) => {
          const t0 = to[i] as number;
          if (f < frame.lo || t0 > frame.hi || f > t0) {
            throw new Error(`meanAndSpreadScene: deviations.payload.from/to[${i}] 가 수의 줄 밖이거나 거꾸로다`);
          }
        });
        return {
          ...scene,
          devs: {
            dev,
            from,
            to,
            left: num(p, 'left', 'deviations'),
            right: num(p, 'right', 'deviations'),
            total: num(p, 'total', 'deviations'),
          },
          step: 'deviations',
        };
      }
      case 'squares': {
        need(scene.devs, 'deviations', 'squares');
        const p = payloadOf(event);
        const far = num(p, 'far', 'squares');
        if (!Number.isInteger(far) || far < 0 || far >= n) {
          throw new Error('meanAndSpreadScene: squares.payload.far 가 값의 자리가 아니다');
        }
        return {
          ...scene,
          squares: { sq: nums(p, 'sq', 'squares', n), ss: num(p, 'ss', 'squares'), far },
          step: 'squares',
        };
      }
      case 'variance': {
        need(scene.squares, 'squares', 'variance');
        const p = payloadOf(event);
        const got = {
          ss: num(p, 'ss', 'variance'),
          n: num(p, 'n', 'variance'),
          variance: num(p, 'variance', 'variance'),
          side: num(p, 'side', 'variance'),
        };
        if (got.n !== n) throw new Error(`meanAndSpreadScene: variance.payload.n ${got.n} 가 값의 수 ${n} 와 다르다`);
        return { ...scene, variance: got, step: 'variance' };
      }
      case 'spread': {
        need(scene.variance, 'variance', 'spread');
        const p = payloadOf(event);
        return {
          ...scene,
          spread: {
            variance: num(p, 'variance', 'spread'),
            sd: num(p, 'sd', 'spread'),
            bandLo: num(p, 'bandLo', 'spread'),
            bandHi: num(p, 'bandHi', 'spread'),
            inside: indices(p, 'inside', 'spread', n),
          },
          step: 'spread',
        };
      }
      default:
        throw new Error(`meanAndSpreadScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
