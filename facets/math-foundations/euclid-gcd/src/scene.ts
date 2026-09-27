/**
 * euclid-gcd 장면.
 *
 * - 바탕(basis): init 이 한 번 정하는 칸 차례(columns)와 막대 축척의 기준(top)
 * - 자취: 지금 두 수 · 두 약수 목록 · 공약수 목록 · 뺄셈 횟수
 * - 이번 걸음(step): 처음이거나, 한 쪽이 덜어진 뺄셈 한 번 (계기값 from · fromDivisors · fromCommon 을 싣는다)
 *
 * 멈춤은 장면이 두 수가 같음으로 안다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readEuclidGcdData } from './algorithm.js';

export type Side = 'left' | 'right';

export type EuclidGcdStep =
  | { kind: 'start' }
  | {
      kind: 'subtract';
      side: Side;
      from: number;
      by: number;
      to: number;
      fromDivisors: number[];
      fromCommon: number[];
    };

export type EuclidGcdLists = {
  left: number[];
  right: number[];
  common: number[];
};

export type EuclidGcdScene = {
  /** init 전(걸음 0 을 갈아 끼우기 전)에는 null */
  basis: { columns: number[]; top: number } | null;
  left: number;
  right: number;
  lists: EuclidGcdLists | null;
  subtractions: number;
  step: EuclidGcdStep;
};

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`euclid-gcd scene: ${where}.${key} 가 정수가 아니다`);
  }
  return v;
}

function numList(o: Record<string, unknown>, key: string, where: string): number[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`euclid-gcd scene: ${where}.${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x <= 0) {
      throw new Error(`euclid-gcd scene: ${where}.${key}[${i}] 가 양의 정수가 아니다`);
    }
    return x;
  });
}

function record(x: unknown, where: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`euclid-gcd scene: ${where} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function mustBeInColumns(list: readonly number[], columns: readonly number[], where: string): void {
  for (const d of list) {
    if (!columns.includes(d)) throw new Error(`euclid-gcd scene: ${where} 의 ${d} 가 칸에 없다`);
  }
}

export const euclidGcdScene: ScenePlan<EuclidGcdScene> = {
  initial(initialData: unknown): EuclidGcdScene {
    const data = readEuclidGcdData(initialData);
    return {
      basis: null,
      left: data.left,
      right: data.right,
      lists: null,
      subtractions: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EuclidGcdScene, event: FacetRuntimeEvent): EuclidGcdScene {
    switch (event.type) {
      case 'init': {
        const p = record(event.payload, 'init.payload');
        const left = num(p, 'left', 'init.payload');
        const right = num(p, 'right', 'init.payload');
        const top = num(p, 'top', 'init.payload');
        const columns = numList(p, 'columns', 'init.payload');
        const lists: EuclidGcdLists = {
          left: numList(p, 'leftDivisors', 'init.payload'),
          right: numList(p, 'rightDivisors', 'init.payload'),
          common: numList(p, 'common', 'init.payload'),
        };
        if (left !== scene.left || right !== scene.right) {
          throw new Error('euclid-gcd scene: init.payload 의 두 수가 initialData 와 다르다');
        }
        if (top < left || top < right) throw new Error('euclid-gcd scene: init.payload.top 이 두 수보다 작다');
        mustBeInColumns(lists.left, columns, 'init.payload.leftDivisors');
        mustBeInColumns(lists.right, columns, 'init.payload.rightDivisors');
        mustBeInColumns(lists.common, columns, 'init.payload.common');
        return {
          basis: { columns: [...columns], top },
          left,
          right,
          lists,
          subtractions: 0,
          step: { kind: 'start' },
        };
      }
      case 'subtract': {
        if (scene.basis === null || scene.lists === null) {
          throw new Error('euclid-gcd scene: init 전에 subtract 가 왔다');
        }
        const p = record(event.payload, 'subtract.payload');
        const side = p.side;
        if (side !== 'left' && side !== 'right') {
          throw new Error(`euclid-gcd scene: subtract.payload.side 가 left/right 가 아니다 (${String(side)})`);
        }
        const from = num(p, 'from', 'subtract.payload');
        const by = num(p, 'by', 'subtract.payload');
        const to = num(p, 'to', 'subtract.payload');
        const fromDivisors = numList(p, 'fromDivisors', 'subtract.payload');
        const fromCommon = numList(p, 'fromCommon', 'subtract.payload');
        const divisors = numList(p, 'divisors', 'subtract.payload');
        const common = numList(p, 'common', 'subtract.payload');
        const listNow = scene.lists[side];
        if (!sameList(fromDivisors, listNow)) {
          throw new Error(`euclid-gcd scene: subtract.payload.fromDivisors 가 장면의 ${side} 약수 목록과 다르다`);
        }
        if (!sameList(fromCommon, scene.lists.common)) {
          throw new Error('euclid-gcd scene: subtract.payload.fromCommon 이 장면의 공약수 목록과 다르다');
        }
        const here = side === 'left' ? scene.left : scene.right;
        const other = side === 'left' ? scene.right : scene.left;
        if (from !== here) throw new Error(`euclid-gcd scene: subtract.payload.from ${from} 이 지금 ${side} 값 ${here} 과 다르다`);
        if (by !== other) throw new Error(`euclid-gcd scene: subtract.payload.by ${by} 가 맞은편 값 ${other} 과 다르다`);
        if (to !== from - by || to <= 0) throw new Error('euclid-gcd scene: subtract.payload.to 가 from − by 가 아니다');
        mustBeInColumns(divisors, scene.basis.columns, 'subtract.payload.divisors');
        mustBeInColumns(common, scene.basis.columns, 'subtract.payload.common');
        const lists: EuclidGcdLists =
          side === 'left'
            ? { left: divisors, right: [...scene.lists.right], common }
            : { left: [...scene.lists.left], right: divisors, common };
        return {
          basis: scene.basis,
          left: side === 'left' ? to : scene.left,
          right: side === 'right' ? to : scene.right,
          lists,
          subtractions: scene.subtractions + 1,
          step: { kind: 'subtract', side, from, by, to, fromDivisors, fromCommon },
        };
      }
      default:
        throw new Error(`euclid-gcd scene: 모르는 이벤트 ${event.type}`);
    }
  },
};

/** 두 수가 같아 멈춘 장면인가. */
export function isStopped(scene: EuclidGcdScene): boolean {
  return scene.lists !== null && scene.left === scene.right;
}
