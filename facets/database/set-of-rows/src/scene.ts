/**
 * set-of-rows 의 장면. 바탕(릴레이션 · 두 차례 · 들어오는 줄)은 initialData 에서 베끼고,
 * 자취(옮김 · 짝 · 들어옴 · 포개짐)는 이벤트가 쌓는다. 셈은 알고리즘이 했다 — 여기서는 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readSetOfRowsData, type Row } from './algorithm.js';

export type SetOfRowsMove = { from: number; to: number };

export type SetOfRowsMatch = {
  pairs: { a: number; b: number }[];
  aInB: number;
  aSize: number;
  bInA: number;
  bSize: number;
  same: boolean;
};

export type SetOfRowsMerge = { twin: number | null; before: number; after: number; same: boolean };

export type SetOfRowsStep = 'start' | 'move' | 'match' | 'enter' | 'merge';

export type SetOfRowsScene = {
  // 바탕
  relation: string;
  columns: string[];
  orderA: Row[];
  orderB: Row[];
  incoming: Row;
  // 자취
  moves: SetOfRowsMove[] | null;
  match: SetOfRowsMatch | null;
  entered: { twin: number | null } | null;
  merged: SetOfRowsMerge | null;
  // 이번 걸음
  step: SetOfRowsStep;
};

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`set-of-rows 장면: ${what} payload 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`set-of-rows 장면: ${what} 가 0 이상의 정수가 아니다`);
  return v;
}

function flag(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`set-of-rows 장면: ${what} 가 참/거짓이 아니다`);
  return v;
}

function twinOf(v: unknown): number | null {
  return v === null ? null : num(v, 'twin');
}

function list(v: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new Error(`set-of-rows 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => asRecord(x, what));
}

export const setOfRowsScene: ScenePlan<SetOfRowsScene> = {
  initial(initialData: unknown): SetOfRowsScene {
    const d = readSetOfRowsData(initialData);
    return {
      relation: d.relation,
      columns: [...d.columns],
      orderA: d.orderA.map((r) => [...r]),
      orderB: d.orderB.map((r) => [...r]),
      incoming: [...d.incoming],
      moves: null,
      match: null,
      entered: null,
      merged: null,
      step: 'start',
    };
  },

  reduce(scene: SetOfRowsScene, event: FacetRuntimeEvent): SetOfRowsScene {
    switch (event.type) {
      case 'move': {
        const p = asRecord(event.payload, 'move');
        const moves = list(p.moves, 'moves').map((m) => ({ from: num(m.from, 'from'), to: num(m.to, 'to') }));
        return { ...scene, moves, step: 'move' };
      }
      case 'match': {
        const p = asRecord(event.payload, 'match');
        const match: SetOfRowsMatch = {
          pairs: list(p.pairs, 'pairs').map((x) => ({ a: num(x.a, 'a'), b: num(x.b, 'b') })),
          aInB: num(p.aInB, 'aInB'),
          aSize: num(p.aSize, 'aSize'),
          bInA: num(p.bInA, 'bInA'),
          bSize: num(p.bSize, 'bSize'),
          same: flag(p.same, 'same'),
        };
        return { ...scene, match, step: 'match' };
      }
      case 'enter': {
        const p = asRecord(event.payload, 'enter');
        return { ...scene, entered: { twin: twinOf(p.twin) }, step: 'enter' };
      }
      case 'merge': {
        const p = asRecord(event.payload, 'merge');
        const merged: SetOfRowsMerge = {
          twin: twinOf(p.twin),
          before: num(p.before, 'before'),
          after: num(p.after, 'after'),
          same: flag(p.same, 'same'),
        };
        return { ...scene, merged, step: 'merge' };
      }
      default:
        throw new Error(`set-of-rows 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
