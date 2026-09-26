/**
 * same-weights-each-step 의 장면.
 *
 * 바탕: 무게 한 벌 · 무게의 수 · 입력 차례 · h0 · 기호 (initial 이 initialData 에서 베낀다)
 * 자취: 셈을 마친 걸음들 (걸음마다 받은 h · a · 새 h), 쓰인 횟수 · 따로라면의 수
 * 이번 걸음: step — 방금 무게 한 벌이 불려 간 걸음
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readSameWeightsData, weightCount, type SameWeightsEachStepFacetData } from './algorithm.js';

export type StepMark = { k: number; x: number; hIn: number[]; a: number[]; h: number[] };

export type SameWeightsScene = {
  symbols: SameWeightsEachStepFacetData['symbols'];
  wx: number[];
  wh: number[][];
  b: number[];
  count: number;
  inputs: number[];
  h0: number[];
  trail: StepMark[];
  uses: number;
  separate: number;
  step: StepMark | null;
};

function numArr(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every((n) => typeof n === 'number')) {
    throw new Error(`same-weights-each-step scene: ${what} 가 수 배열이 아니다`);
  }
  return [...(v as number[])];
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`same-weights-each-step scene: ${what} 가 수가 아니다`);
  return v;
}

export const sameWeightsEachStepScene: ScenePlan<SameWeightsScene> = {
  initial(initialData: unknown): SameWeightsScene {
    const data = readSameWeightsData(initialData);
    return {
      symbols: { ...data.symbols },
      wx: [...data.wx],
      wh: data.wh.map((row) => [...row]),
      b: [...data.b],
      count: weightCount(data),
      inputs: [...data.inputs],
      h0: [...data.h0],
      trail: [],
      uses: 0,
      separate: 0,
      step: null,
    };
  },

  reduce(scene: SameWeightsScene, event: FacetRuntimeEvent): SameWeightsScene {
    if (event.type !== 'step') {
      throw new Error(`same-weights-each-step scene: 모르는 이벤트 ${event.type}`);
    }
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('same-weights-each-step scene: step 에 payload 가 없다');
    const f = (key: string): unknown => (p as Record<string, unknown>)[key];
    const mark: StepMark = {
      k: num(f('k'), 'k'),
      x: num(f('x'), 'x'),
      hIn: numArr(f('hIn'), 'hIn'),
      a: numArr(f('a'), 'a'),
      h: numArr(f('h'), 'h'),
    };
    return {
      ...scene,
      trail: [...scene.trail, mark],
      uses: num(f('uses'), 'uses'),
      separate: num(f('separate'), 'separate'),
      step: mark,
    };
  },
};
