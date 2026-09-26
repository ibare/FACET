/**
 * 보폭과 패딩의 장면.
 *
 * 바탕: 입력 · 창의 무게 · 패딩 · 보폭 (initialData 에서 베낀다 — 걸음 0 = 두르기 전 입력)
 *       출력 크기 (silent size 이벤트) · 두른 격자 (pad 이벤트)
 * 자취: 앉은 자리들 (자리 · 창 안 두른 칸 · 출력 칸 · 값)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowData, narrowGrid } from './algorithm.js';

export type SeatMark = {
  r: number;
  c: number;
  padCells: number;
  or: number;
  oc: number;
  value: number;
};

export type StrideAndPaddingStep =
  | { kind: 'start' }
  | { kind: 'pad'; added: number }
  | { kind: 'seat'; seat: SeatMark; from: { r: number; c: number } | null };

export type StrideAndPaddingScene = {
  input: number[][];
  kernel: number[][];
  padding: number;
  stride: number;
  /** 두른 격자 — 두르기 전이면 null. */
  padded: number[][] | null;
  outRows: number;
  outCols: number;
  seats: SeatMark[];
  step: StrideAndPaddingStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${event.type}: payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function num(obj: Record<string, unknown>, key: string, what: string): number {
  const v = obj[key];
  if (typeof v !== 'number') throw new Error(`${what}: ${key} 가 수가 아니다`);
  return v;
}

function readFrom(v: unknown): { r: number; c: number } | null {
  if (v === null) return null;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.r === 'number' && typeof o.c === 'number') return { r: o.r, c: o.c };
  }
  throw new Error('seat: from 이 자리도 null 도 아니다');
}

export const strideAndPaddingScene: ScenePlan<StrideAndPaddingScene> = {
  initial(initialData: unknown): StrideAndPaddingScene {
    // narrowData 가 격자를 베껴 돌려준다 — 넘겨받은 자료를 참조로 쥐지 않는다.
    const d = narrowData(initialData);
    return {
      input: d.input,
      kernel: d.kernel,
      padding: d.padding,
      stride: d.stride,
      padded: null,
      outRows: 0,
      outCols: 0,
      seats: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: StrideAndPaddingScene, event: FacetRuntimeEvent): StrideAndPaddingScene {
    const p = payloadOf(event);
    switch (event.type) {
      case 'size':
        return { ...scene, outRows: num(p, 'outRows', 'size'), outCols: num(p, 'outCols', 'size') };
      case 'pad':
        return {
          ...scene,
          padded: narrowGrid(p.grid, 'pad: grid'),
          step: { kind: 'pad', added: num(p, 'added', 'pad') },
        };
      case 'seat': {
        const seat: SeatMark = {
          r: num(p, 'r', 'seat'),
          c: num(p, 'c', 'seat'),
          padCells: num(p, 'padCells', 'seat'),
          or: num(p, 'or', 'seat'),
          oc: num(p, 'oc', 'seat'),
          value: num(p, 'value', 'seat'),
        };
        return {
          ...scene,
          seats: [...scene.seats, seat],
          step: { kind: 'seat', seat, from: readFrom(p.from) },
        };
      }
      default:
        throw new Error(`모르는 이벤트: ${event.type}`);
    }
  },
};
