/**
 * 장면 — 바탕(표 · SQL 글자)과 자취(안쪽의 답 · 자리 바꿈 · 바깥 판정)와 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트의 값을 옮겨 담기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { columnIndex, type QueryCell } from './algorithm.js';

export type InnerAnswer = { values: number[]; total: number; count: number; value: number };

export type QueryInsideQueryScene = {
  // 바탕
  table: string;
  columns: string[];
  rows: QueryCell[][];
  /** 안쪽 집계가 읽는 열의 자리 */
  innerAt: number;
  /** 바깥 WHERE 가 견주는 열의 자리 */
  outerAt: number;
  sql: { head: string[]; lead: string; inner: string; tail: string };
  // 자취
  inner: InnerAnswer | null;
  substituted: boolean;
  verdicts: boolean[] | null;
  kept: number | null;
  // 이번 걸음
  step: 'start' | 'inner' | 'substitute' | 'filter';
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) {
    throw new Error(`queryInsideQueryScene: ${what} 가 글자 배열이 아니다`);
  }
  return [...v];
}

function text(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`queryInsideQueryScene: ${what} 가 글자가 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`queryInsideQueryScene: ${what} 가 수가 아니다`);
  return v;
}

function readRows(v: unknown, width: number): QueryCell[][] {
  if (!Array.isArray(v)) throw new Error('queryInsideQueryScene: rows 가 배열이 아니다');
  return v.map((row, i) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(`queryInsideQueryScene: ${i + 1} 번째 줄의 칸 수가 열 수와 다르다`);
    }
    return row.map((cell) => {
      if (typeof cell !== 'string' && typeof cell !== 'number') {
        throw new Error(`queryInsideQueryScene: ${i + 1} 번째 줄에 글자도 수도 아닌 칸이 있다`);
      }
      return cell;
    });
  });
}

export const queryInsideQueryScene: ScenePlan<QueryInsideQueryScene> = {
  initial(initialData: unknown): QueryInsideQueryScene {
    if (!isRecord(initialData)) throw new Error('queryInsideQueryScene: initialData 가 없다');
    const columns = strings(initialData.columns, 'columns');
    const inner = initialData.inner;
    const outer = initialData.outer;
    const sql = initialData.sql;
    if (!isRecord(inner) || !isRecord(outer) || !isRecord(sql)) {
      throw new Error('queryInsideQueryScene: inner · outer · sql 이 없다');
    }
    return {
      table: text(initialData.table, 'table'),
      columns,
      rows: readRows(initialData.rows, columns.length),
      innerAt: columnIndex(columns, text(inner.column, 'inner.column')),
      outerAt: columnIndex(columns, text(outer.column, 'outer.column')),
      sql: {
        head: strings(sql.head, 'sql.head'),
        lead: text(sql.lead, 'sql.lead'),
        inner: text(sql.inner, 'sql.inner'),
        tail: text(sql.tail, 'sql.tail'),
      },
      inner: null,
      substituted: false,
      verdicts: null,
      kept: null,
      step: 'start',
    };
  },

  reduce(scene: QueryInsideQueryScene, event: FacetRuntimeEvent): QueryInsideQueryScene {
    const p = event.payload;
    switch (event.type) {
      case 'inner-run': {
        if (!isRecord(p) || !Array.isArray(p.values)) throw new Error('queryInsideQueryScene: inner-run payload 가 틀렸다');
        const values = p.values.map((v, i) => num(v, `values[${i}]`));
        return {
          ...scene,
          inner: { values, total: num(p.total, 'total'), count: num(p.count, 'count'), value: num(p.value, 'value') },
          step: 'inner',
        };
      }
      case 'substitute': {
        if (!isRecord(p)) throw new Error('queryInsideQueryScene: substitute payload 가 틀렸다');
        if (scene.inner === null || scene.inner.value !== num(p.value, 'value')) {
          throw new Error('queryInsideQueryScene: 안쪽이 돌기 전에 자리를 바꿀 수 없다');
        }
        return { ...scene, substituted: true, step: 'substitute' };
      }
      case 'filter': {
        if (!isRecord(p) || !Array.isArray(p.verdicts)) throw new Error('queryInsideQueryScene: filter payload 가 틀렸다');
        const verdicts = p.verdicts.map((v, i) => {
          if (typeof v !== 'boolean') throw new Error(`queryInsideQueryScene: verdicts[${i}] 가 참거짓이 아니다`);
          return v;
        });
        if (verdicts.length !== scene.rows.length) throw new Error('queryInsideQueryScene: 판정 수가 줄 수와 다르다');
        return { ...scene, verdicts, kept: num(p.kept, 'kept'), step: 'filter' };
      }
      default:
        return scene;
    }
  },
};
