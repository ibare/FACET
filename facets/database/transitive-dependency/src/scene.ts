/**
 * transitive-dependency 의 장면.
 *
 * - 바탕: 표 이름 · 열 · 열쇠 · 줄 · 선언된 종속 (initialData 에서 베낀다)
 * - 자취: 닿은 열과 그 건넌 고리 수 · 줄의 묶음 번호 · 끊긴 고리 · 떼어 낸 표
 * - 이번 걸음: step
 *
 * 셈(폐포 · 떼어 내기)은 알고리즘이 했다. 여기서는 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowTransitiveData, type FunctionalDependency } from './algorithm.js';

export type TdReached = { col: string; hops: number; fd: number | null };

export type TdCut = { fd: number; via: string[]; to: string[] };

export type TdSplit = {
  name: string;
  cols: string[];
  keyCols: string[];
  keep: number[];
  slots: number[];
  hops: number[];
  remain: string[];
};

export type TdStep =
  | { kind: 'start' }
  | { kind: 'reach'; fd: number; lhs: string[]; added: string[]; hops: number }
  | { kind: 'cut'; fd: number; via: string[]; to: string[]; distinct: number; total: number }
  | { kind: 'split'; name: string; kept: number; total: number };

export type TransitiveDependencyScene = {
  table: string;
  columns: string[];
  key: string[];
  rows: string[][];
  fds: FunctionalDependency[];
  reached: TdReached[];
  /** 줄 묶음 — cols 의 값이 같은 줄은 같은 번호 (처음 나온 차례). 슈퍼키가 아닌 왼쪽을 지난 적용이 남긴다 */
  groups: { cols: string[]; ids: number[] } | null;
  cut: TdCut | null;
  split: TdSplit | null;
  step: TdStep;
};

function bad(msg: string): never {
  throw new Error(`[transitive-dependency scene] ${msg}`);
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') bad(`${k} 가 글자가 아니다`);
  return v;
}

function strs(o: Record<string, unknown>, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v)) bad(`${k} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string' || x === '') bad(`${k} 에 글자가 아닌 것이 있다`);
    return x;
  });
}

function nums(o: Record<string, unknown>, k: string): number[] {
  const v = o[k];
  if (!Array.isArray(v)) bad(`${k} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) bad(`${k} 에 정수가 아닌 것이 있다`);
    return x;
  });
}

function obj(p: unknown): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) bad('payload 가 객체가 아니다');
  return p as Record<string, unknown>;
}

export const transitiveDependencyScene: ScenePlan<TransitiveDependencyScene> = {
  initial(initialData: unknown): TransitiveDependencyScene {
    const d = narrowTransitiveData(initialData);
    return {
      table: d.table,
      columns: [...d.columns],
      key: [...d.key],
      rows: d.rows.map((r) => [...r]),
      fds: d.fds.map((f) => ({ lhs: [...f.lhs], rhs: [...f.rhs] })),
      reached: d.key.map((col) => ({ col, hops: 0, fd: null })),
      groups: null,
      cut: null,
      split: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: TransitiveDependencyScene, event: FacetRuntimeEvent): TransitiveDependencyScene {
    if (event.type === 'reach') {
      const p = obj(event.payload);
      const fd = num(p, 'fd');
      const lhs = strs(p, 'lhs');
      const added = strs(p, 'added');
      const hops = num(p, 'hops');
      const g = p.groups;
      const groups = g === null ? scene.groups : { cols: [...lhs, ...added], ids: nums(p, 'groups') };
      return {
        ...scene,
        reached: [...scene.reached, ...added.map((col) => ({ col, hops, fd }))],
        groups,
        step: { kind: 'reach', fd, lhs, added, hops },
      };
    }
    if (event.type === 'cut') {
      const p = obj(event.payload);
      const fd = num(p, 'fd');
      const via = strs(p, 'via');
      const to = strs(p, 'to');
      return {
        ...scene,
        cut: { fd, via, to },
        step: { kind: 'cut', fd, via, to, distinct: num(p, 'distinct'), total: num(p, 'total') },
      };
    }
    if (event.type === 'split') {
      const p = obj(event.payload);
      const split: TdSplit = {
        name: str(p, 'name'),
        cols: strs(p, 'cols'),
        keyCols: strs(p, 'keyCols'),
        keep: nums(p, 'keep'),
        slots: nums(p, 'slots'),
        hops: nums(p, 'hops'),
        remain: strs(p, 'remain'),
      };
      return {
        ...scene,
        split,
        step: { kind: 'split', name: split.name, kept: split.keep.length, total: scene.rows.length },
      };
    }
    throw new Error(`[transitive-dependency scene] 모르는 이벤트: ${event.type}`);
  },
};
