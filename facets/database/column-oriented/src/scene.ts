/**
 * column-oriented 의 장면.
 *
 * 바탕 — 표(이름 · 열 · 줄) 와 질의 글. initialData 에서 베낀다. 걸음 0 은 이것만으로 선다.
 * 자취 — 두 담는 법의 쪽 목록, 두 읽기의 셈, 끝.
 * 이번 걸음 — `step.kind`.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트의 값을 옮겨 담기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneValue = string | number;
export type SceneCell = readonly [number, number];

export interface ScenePage {
  /** 열 방향 쪽이면 그 열 번호, 줄 방향 쪽이면 null */
  col: number | null;
  cells: readonly SceneCell[];
}

export interface SceneRead {
  column: number;
  pages: readonly number[];
  brought: number;
  used: number;
  sum: number;
}

export type SceneStepKind = 'table' | 'store-rows' | 'store-columns' | 'read-rows' | 'read-columns' | 'done';

export interface ColumnOrientedScene {
  table: string;
  columns: readonly string[];
  rows: readonly (readonly SceneValue[])[];
  pageCells: number;
  sql: string;
  rowPages: readonly ScenePage[] | null;
  colPages: readonly ScenePage[] | null;
  rowRead: SceneRead | null;
  colRead: SceneRead | null;
  sum: number | null;
  step: { kind: SceneStepKind };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function num(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${what} 가 수가 아니다`);
  return x;
}

function str(x: unknown, what: string): string {
  if (typeof x !== 'string') throw new Error(`${what} 가 글이 아니다`);
  return x;
}

function cellOf(x: unknown): SceneCell {
  if (!Array.isArray(x) || x.length !== 2) throw new Error('칸이 [줄, 열] 꼴이 아니다');
  return [num(x[0], '칸의 줄'), num(x[1], '칸의 열')];
}

function cellsOf(x: unknown): SceneCell[] {
  if (!Array.isArray(x)) throw new Error('칸 목록이 배열이 아니다');
  return x.map(cellOf);
}

function readOf(x: unknown): SceneRead {
  if (!isRecord(x)) throw new Error('읽기 셈이 객체가 아니다');
  if (!Array.isArray(x.pages)) throw new Error('읽은 쪽이 배열이 아니다');
  return {
    column: num(x.column, 'column'),
    pages: x.pages.map((p) => num(p, '쪽 번호')),
    brought: num(x.brought, 'brought'),
    used: num(x.used, 'used'),
    sum: num(x.sum, 'sum'),
  };
}

export const columnOrientedScene: ScenePlan<ColumnOrientedScene> = {
  initial(initialData: unknown): ColumnOrientedScene {
    if (!isRecord(initialData)) throw new Error('initialData 가 없다');
    const { columns, rows } = initialData;
    if (!Array.isArray(columns)) throw new Error('columns 가 배열이 아니다');
    if (!Array.isArray(rows)) throw new Error('rows 가 배열이 아니다');
    return {
      table: str(initialData.table, 'table'),
      columns: columns.map((c) => str(c, '열 이름')),
      rows: rows.map((row) => {
        if (!Array.isArray(row)) throw new Error('줄이 배열이 아니다');
        return row.map((v): SceneValue => {
          if (typeof v === 'string' || typeof v === 'number') return v;
          throw new Error('칸 값이 글도 수도 아니다');
        });
      }),
      pageCells: num(initialData.pageCells, 'pageCells'),
      sql: str(initialData.sql, 'sql'),
      rowPages: null,
      colPages: null,
      rowRead: null,
      colRead: null,
      sum: null,
      step: { kind: 'table' },
    };
  },

  reduce(scene: ColumnOrientedScene, event: FacetRuntimeEvent): ColumnOrientedScene {
    const p = event.payload;
    switch (event.type) {
      case 'store-rows': {
        if (!isRecord(p) || !Array.isArray(p.pages)) throw new Error('store-rows 의 pages 가 없다');
        const pages = p.pages.map((cells): ScenePage => ({ col: null, cells: cellsOf(cells) }));
        return { ...scene, rowPages: pages, step: { kind: 'store-rows' } };
      }
      case 'store-columns': {
        if (!isRecord(p) || !Array.isArray(p.pages)) throw new Error('store-columns 의 pages 가 없다');
        const pages = p.pages.map((pg): ScenePage => {
          if (!isRecord(pg)) throw new Error('열 방향 쪽이 객체가 아니다');
          return { col: num(pg.col, '쪽의 열'), cells: cellsOf(pg.cells) };
        });
        return { ...scene, colPages: pages, step: { kind: 'store-columns' } };
      }
      case 'read-rows':
        return { ...scene, rowRead: readOf(p), step: { kind: 'read-rows' } };
      case 'read-columns':
        return { ...scene, colRead: readOf(p), step: { kind: 'read-columns' } };
      case 'done': {
        if (!isRecord(p)) throw new Error('done 의 payload 가 없다');
        return { ...scene, sum: num(p.sum, 'sum'), step: { kind: 'done' } };
      }
      default:
        return scene;
    }
  },
};
