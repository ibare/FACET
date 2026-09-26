/**
 * diagonal-is-free 의 장면.
 *
 * 바탕: 두 파일의 줄 (initialData 에서 베낀다).
 * 자취: 지금까지 뻗은 끝점들 (`reached`) 과 끝에 닿았을 때의 되짚은 경로 (`path`).
 * 이번 걸음: 방금 뻗은 끝점의 차례 (`step`). 걸음 0 은 null.
 *
 * 셈은 알고리즘이 한다 — 장면은 reach 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readLines, type MyersMove, type MyersReach } from './algorithm';

export type DiagonalIsFreeScene = {
  a: string[];
  b: string[];
  reached: MyersReach[];
  path: number[] | null;
  step: { index: number } | null;
};

function field(payload: object, name: string): unknown {
  return (payload as Record<string, unknown>)[name];
}

function readInt(payload: object, name: string): number {
  const v = field(payload, name);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`diagonal-is-free: reach.payload.${name} 가 정수가 아니다`);
  }
  return v;
}

function readPoint(payload: object, name: string): [number, number] {
  const v = field(payload, name);
  if (!Array.isArray(v) || v.length !== 2) {
    throw new Error(`diagonal-is-free: reach.payload.${name} 가 자리 (x, y) 가 아니다`);
  }
  const [x, y] = v as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error(`diagonal-is-free: reach.payload.${name} 의 좌표가 수가 아니다`);
  }
  return [x, y];
}

function readMove(payload: object): MyersMove {
  const v = field(payload, 'move');
  if (v === 'start' || v === 'down' || v === 'right') return v;
  throw new Error(`diagonal-is-free: reach.payload.move 를 모른다: ${String(v)}`);
}

function readPath(payload: object): number[] | null {
  const v = field(payload, 'path');
  if (v === null) return null;
  if (!Array.isArray(v)) throw new Error('diagonal-is-free: reach.payload.path 가 목록이 아니다');
  return v.map((i, n) => {
    if (typeof i !== 'number' || !Number.isInteger(i)) {
      throw new Error(`diagonal-is-free: reach.payload.path[${n}] 가 정수가 아니다`);
    }
    return i;
  });
}

export const diagonalIsFreeScene: ScenePlan<DiagonalIsFreeScene> = {
  initial(initialData: unknown): DiagonalIsFreeScene {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('diagonal-is-free: initialData 가 객체가 아니다');
    }
    const data = initialData as Record<string, unknown>;
    return {
      a: [...readLines(data.a, 'a')],
      b: [...readLines(data.b, 'b')],
      reached: [],
      path: null,
      step: null,
    };
  },

  reduce(scene: DiagonalIsFreeScene, event: FacetRuntimeEvent): DiagonalIsFreeScene {
    if (event.type !== 'reach') {
      throw new Error(`diagonal-is-free: 모르는 이벤트 ${event.type}`);
    }
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('diagonal-is-free: reach.payload 가 객체가 아니다');
    }
    const index = readInt(p, 'index');
    if (index !== scene.reached.length) {
      throw new Error(`diagonal-is-free: reach.payload.index ${index} 가 차례 ${scene.reached.length} 와 다르다`);
    }
    const reach: MyersReach = {
      d: readInt(p, 'd'),
      k: readInt(p, 'k'),
      move: readMove(p),
      from: readPoint(p, 'from'),
      mid: readPoint(p, 'mid'),
      to: readPoint(p, 'to'),
      slide: readInt(p, 'slide'),
    };
    return {
      a: scene.a,
      b: scene.b,
      reached: [...scene.reached, reach],
      path: readPath(p),
      step: { index },
    };
  },
};
