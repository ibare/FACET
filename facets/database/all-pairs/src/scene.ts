/**
 * all-pairs 장면 — 이벤트를 잇기만 한다. 짝 짓기 · 줄 수 셈은 알고리즘이 한다.
 *
 * 바탕  : SQL 줄 · 두 표 (initial 이 initialData 에서 베낀다)
 * 자취  : 결과 줄(짝) · 퍼져 나간 왼쪽 줄 · 결과 줄 수
 * 이번  : step — 처음이거나, 왼쪽 줄 하나가 퍼져 나간 걸음
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readAllPairsData, type AllPairsTable } from './algorithm.js';

export type AllPairsPair = { size: number; color: number };

export type AllPairsStep =
  | { kind: 'start' }
  | { kind: 'spread'; size: number; added: number };

export type AllPairsScene = {
  sql: string[];
  left: AllPairsTable;
  right: AllPairsTable;
  /** 결과 줄 — 생긴 차례 그대로 */
  result: AllPairsPair[];
  /** 이미 퍼져 나간 왼쪽 줄 번호 */
  spent: number[];
  /** 결과 줄 수 (알고리즘이 셈한 값) */
  rows: number;
  step: AllPairsStep;
};

function copyTable(t: AllPairsTable): AllPairsTable {
  return { name: t.name, column: t.column, rows: [...t.rows] };
}

function readPairs(v: unknown): AllPairsPair[] {
  if (!Array.isArray(v)) throw new Error('all-pairs 장면: pairs 가 배열이 아니다');
  return v.map((p: unknown) => {
    if (typeof p !== 'object' || p === null) throw new Error('all-pairs 장면: 짝이 객체가 아니다');
    const size: unknown = Reflect.get(p, 'size');
    const color: unknown = Reflect.get(p, 'color');
    if (typeof size !== 'number' || typeof color !== 'number') {
      throw new Error('all-pairs 장면: 짝의 size · color 가 수가 아니다');
    }
    return { size, color };
  });
}

export const allPairsScene: ScenePlan<AllPairsScene> = {
  initial(initialData: unknown): AllPairsScene {
    const data = readAllPairsData(initialData);
    return {
      sql: [...data.sql],
      left: copyTable(data.left),
      right: copyTable(data.right),
      result: [],
      spent: [],
      rows: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: AllPairsScene, event: FacetRuntimeEvent): AllPairsScene {
    if (event.type !== 'spread') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('all-pairs 장면: spread 의 payload 가 객체가 아니다');
    }
    const size: unknown = Reflect.get(p, 'size');
    const rows: unknown = Reflect.get(p, 'rows');
    if (typeof size !== 'number' || typeof rows !== 'number') {
      throw new Error('all-pairs 장면: spread 의 size · rows 가 수가 아니다');
    }
    const pairs = readPairs(Reflect.get(p, 'pairs'));
    return {
      sql: scene.sql,
      left: scene.left,
      right: scene.right,
      result: [...scene.result, ...pairs],
      spent: [...scene.spent, size],
      rows,
      step: { kind: 'spread', size, added: pairs.length },
    };
  },
};
