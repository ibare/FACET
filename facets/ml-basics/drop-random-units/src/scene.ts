/**
 * drop-random-units 장면.
 *
 * 바탕   ids · h · v (initialData 에서 베낌), base (init 이 정하는 모두 켠 몫 · 출력 · 배율 · 축 범위)
 * 자취   trail (지난 마스크들) · ys (걸음 0 부터의 출력) · rested
 * 이번   step — 걸음 0 이면 'start', 마스크 걸음이면 그 번호와 앞 걸음의 계기값(was*)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowDropRandomUnitsData } from './algorithm.js';

export type DropBase = {
  /** 모두 켠 몫 hᵢ·vᵢ — 걸음 0 의 몫이자 뒤 걸음의 점선(나누기 없는 제 몫) */
  full: number[];
  y0: number;
  scale: number;
  lo: number;
  hi: number;
};

export type DropNow = {
  /** 걸음 0 은 모두 1 */
  mask: number[];
  contribs: number[];
  y: number;
  off: number[];
};

export type DropStep =
  | { kind: 'start' }
  | {
      kind: 'drop';
      n: number;
      wasMask: number[];
      wasContribs: number[];
      wasY: number;
    };

export type DropRandomUnitsScene = {
  ids: string[];
  h: number[];
  v: number[];
  base: DropBase | null;
  now: DropNow | null;
  trail: number[][];
  ys: number[];
  rested: number;
  step: DropStep;
};

function numArray(raw: unknown, path: string, len: number): number[] {
  if (!Array.isArray(raw)) throw new Error(`drop-random-units 장면: ${path} 가 배열이 아니다`);
  if (raw.length !== len) throw new Error(`drop-random-units 장면: ${path} 의 길이가 ${len} 이 아니다`);
  return raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`drop-random-units 장면: ${path}[${i}] 가 수가 아니다`);
    }
    return x;
  });
}

function num(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`drop-random-units 장면: ${path} 가 수가 아니다`);
  }
  return raw;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`drop-random-units 장면: ${event.type}.payload 가 없다`);
  return p as Record<string, unknown>;
}

export const dropRandomUnitsScene: ScenePlan<DropRandomUnitsScene> = {
  initial(initialData: unknown): DropRandomUnitsScene {
    const d = narrowDropRandomUnitsData(initialData);
    return {
      ids: [...d.ids],
      h: [...d.h],
      v: [...d.v],
      base: null,
      now: null,
      trail: [],
      ys: [],
      rested: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: DropRandomUnitsScene, event: FacetRuntimeEvent): DropRandomUnitsScene {
    const n = scene.ids.length;
    switch (event.type) {
      case 'init': {
        if (scene.base !== null) throw new Error('drop-random-units 장면: init 이 두 번 왔다');
        const p = payloadOf(event);
        const full = numArray(p.contribs, 'init.payload.contribs', n);
        const y0 = num(p.y, 'init.payload.y');
        const base: DropBase = {
          full,
          y0,
          scale: num(p.scale, 'init.payload.scale'),
          lo: num(p.lo, 'init.payload.lo'),
          hi: num(p.hi, 'init.payload.hi'),
        };
        if (!(base.lo <= 0 && base.hi >= 0 && base.hi > base.lo)) {
          throw new Error('drop-random-units 장면: init.payload.lo · hi 가 0 을 담지 않는다');
        }
        return {
          ...scene,
          base,
          now: { mask: full.map(() => 1), contribs: [...full], y: y0, off: [] },
          ys: [y0],
          step: { kind: 'start' },
        };
      }
      case 'drop': {
        const now = scene.now;
        if (scene.base === null || now === null) throw new Error('drop-random-units 장면: init 앞에 drop 이 왔다');
        const p = payloadOf(event);
        const k = num(p.n, 'drop.payload.n');
        if (k !== scene.trail.length + 1) {
          throw new Error(`drop-random-units 장면: drop.payload.n 은 ${scene.trail.length + 1} 이어야 한다`);
        }
        const mask = numArray(p.mask, 'drop.payload.mask', n);
        mask.forEach((b, i) => {
          if (b !== 0 && b !== 1) throw new Error(`drop-random-units 장면: drop.payload.mask[${i}] 가 0 · 1 이 아니다`);
        });
        const contribs = numArray(p.contribs, 'drop.payload.contribs', n);
        if (!Array.isArray(p.off)) throw new Error('drop-random-units 장면: drop.payload.off 가 배열이 아니다');
        const off = p.off.map((x, j) => {
          if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= n || mask[x] !== 0) {
            throw new Error(`drop-random-units 장면: drop.payload.off[${j}] 가 쉬는 칸을 가리키지 않는다`);
          }
          return x;
        });
        const y = num(p.y, 'drop.payload.y');
        const rested = num(p.rested, 'drop.payload.rested');
        return {
          ...scene,
          now: { mask, contribs, y, off },
          trail: [...scene.trail, mask],
          ys: [...scene.ys, y],
          rested,
          step: { kind: 'drop', n: k, wasMask: [...now.mask], wasContribs: [...now.contribs], wasY: now.y },
        };
      }
      default:
        throw new Error(`drop-random-units 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
