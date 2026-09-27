/**
 * 멱집합 장면.
 *
 * 바탕   name · elements (initialData 에서 베낀다) · total (init 이 싣는다)
 * 자취   taken (들인 원소 수) · subsets (지금 모음) · counts (걸음마다 모음의 길이)
 * 이번 걸음  step — 처음이거나, 원소 하나를 들인 걸음
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPowerSetData } from './algorithm.js';

export type PowerSetStep =
  | { kind: 'start' }
  | { kind: 'take'; element: string; index: number; from: number; to: number };

export type PowerSetScene = {
  name: string;
  elements: string[];
  /** 원소를 모두 들인 뒤 모음의 길이. init 전에는 null */
  total: number | null;
  taken: number;
  subsets: string[][];
  counts: number[];
  step: PowerSetStep;
};

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`powerSetScene: ${where} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function asInt(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`powerSetScene: ${where} 가 0 이상의 정수가 아니다`);
  }
  return v;
}

function asSubsets(v: unknown, elements: readonly string[], where: string): string[][] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`powerSetScene: ${where} 가 비었거나 배열이 아니다`);
  }
  return v.map((s, i) => {
    if (!Array.isArray(s)) {
      throw new Error(`powerSetScene: ${where}[${i}] 가 배열이 아니다`);
    }
    return s.map((e, j) => {
      if (typeof e !== 'string' || !elements.includes(e)) {
        throw new Error(`powerSetScene: ${where}[${i}][${j}] 가 S 의 원소가 아니다`);
      }
      return e;
    });
  });
}

function sameSubset(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((e, i) => e === b[i]);
}

export const powerSetScene: ScenePlan<PowerSetScene> = {
  initial(initialData: unknown): PowerSetScene {
    const data = narrowPowerSetData(initialData);
    return {
      name: data.name,
      elements: [...data.elements],
      total: null,
      taken: 0,
      subsets: [],
      counts: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: PowerSetScene, event: FacetRuntimeEvent): PowerSetScene {
    switch (event.type) {
      case 'init': {
        const p = asRecord(event.payload, 'init.payload');
        const subsets = asSubsets(p.subsets, scene.elements, 'init.payload.subsets');
        const total = asInt(p.total, 'init.payload.total');
        if (total < subsets.length) {
          throw new Error('powerSetScene: init.payload.total 가 처음 모음보다 작다');
        }
        return {
          ...scene,
          total,
          taken: 0,
          subsets,
          counts: [subsets.length],
          step: { kind: 'start' },
        };
      }
      case 'take': {
        if (scene.total === null) {
          throw new Error('powerSetScene: init 보다 take 가 먼저 왔다');
        }
        const p = asRecord(event.payload, 'take.payload');
        if (typeof p.element !== 'string') {
          throw new Error('powerSetScene: take.payload.element 가 문자열이 아니다');
        }
        const element = p.element;
        const index = asInt(p.index, 'take.payload.index');
        const from = asInt(p.from, 'take.payload.from');
        const to = asInt(p.to, 'take.payload.to');
        if (index !== scene.taken || scene.elements[index] !== element) {
          throw new Error(
            `powerSetScene: take.payload.element (${element}) 가 들일 차례의 원소가 아니다`,
          );
        }
        if (from !== scene.subsets.length) {
          throw new Error(
            `powerSetScene: take.payload.from (${from}) 가 지금 모음의 길이 (${scene.subsets.length}) 와 다르다`,
          );
        }
        const subsets = asSubsets(p.subsets, scene.elements, 'take.payload.subsets');
        if (subsets.length !== to || to > scene.total) {
          throw new Error(`powerSetScene: take.payload.to (${to}) 가 모음의 길이와 맞지 않다`);
        }
        scene.subsets.forEach((old, i) => {
          const now = subsets[i];
          if (now === undefined || !sameSubset(old, now)) {
            throw new Error(`powerSetScene: take.payload.subsets[${i}] 가 옛 부분집합과 다르다`);
          }
        });
        return {
          ...scene,
          taken: scene.taken + 1,
          subsets,
          counts: [...scene.counts, to],
          step: { kind: 'take', element, index, from, to },
        };
      }
      default:
        throw new Error(`powerSetScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
