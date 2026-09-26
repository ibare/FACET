/**
 * atomic-cell 장면 — 이벤트를 잇기만 한다. 가르기 · 견주기 셈은 알고리즘이 한다.
 *
 * 바탕  source · target · before · after · values (init 이 채운다)
 * 자취  flat (풀려 나와 내려앉은 줄) · unpacked (편 원래 줄) · sourceMatch · targetMatch
 * 이번  step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type AtomicCellCond = { column: string; value: string };

export type AtomicCellMatch = { compared: number; matched: number[] };

export type AtomicCellStep =
  | { kind: 'table' }
  | { kind: 'filter'; where: 'source' | 'target' }
  | { kind: 'unpack'; row: number; start: number; count: number };

export type AtomicCellScene = {
  /** 걸음 번호. 흘릴지 고를 때만 쓴다. */
  seq: number;
  source: { table: string; columns: string[]; key: string[]; rows: string[][] };
  target: { table: string; columns: string[]; key: string[] };
  before: AtomicCellCond;
  after: AtomicCellCond;
  /** 편 뒤 줄 수. init 전에는 null. */
  values: number | null;
  flat: { name: string; value: string; from: number }[];
  unpacked: number[];
  sourceMatch: AtomicCellMatch | null;
  targetMatch: AtomicCellMatch | null;
  step: AtomicCellStep;
};

function str(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`atomicCellScene: ${what} 가 글자가 아니다`);
  return value;
}

function strs(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) throw new Error(`atomicCellScene: ${what} 가 목록이 아니다`);
  return value.map((v, i) => str(v, `${what}[${i}]`));
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`atomicCellScene: ${what} 가 없다`);
  return value as Record<string, unknown>;
}

function cond(value: unknown, what: string): AtomicCellCond {
  const o = obj(value, what);
  return { column: str(o.column, `${what}.column`), value: str(o.value, `${what}.value`) };
}

function indices(value: unknown, what: string): number[] {
  if (!Array.isArray(value)) throw new Error(`atomicCellScene: ${what} 가 목록이 아니다`);
  return value.map((v, i) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`atomicCellScene: ${what}[${i}] 가 자리 번호가 아니다`);
    return v;
  });
}

function count(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`atomicCellScene: ${what} 가 개수가 아니다`);
  return value;
}

export const atomicCellScene: ScenePlan<AtomicCellScene> = {
  initial(initialData: unknown): AtomicCellScene {
    const d = obj(initialData, 'initialData');
    const src = obj(d.source, 'source');
    const tgt = obj(d.target, 'target');
    if (!Array.isArray(src.rows)) throw new Error('atomicCellScene: source.rows 가 목록이 아니다');
    return {
      seq: 0,
      source: {
        table: str(src.table, 'source.table'),
        columns: strs(src.columns, 'source.columns'),
        key: strs(src.key, 'source.key'),
        rows: src.rows.map((row, i) => strs(row, `source.rows[${i}]`)),
      },
      target: {
        table: str(tgt.table, 'target.table'),
        columns: strs(tgt.columns, 'target.columns'),
        key: strs(tgt.key, 'target.key'),
      },
      before: cond(d.before, 'before'),
      after: cond(d.after, 'after'),
      values: null,
      flat: [],
      unpacked: [],
      sourceMatch: null,
      targetMatch: null,
      step: { kind: 'table' },
    };
  },

  reduce(scene: AtomicCellScene, event: FacetRuntimeEvent): AtomicCellScene {
    const p = (event.payload ?? {}) as { [k: string]: unknown };
    switch (event.type) {
      case 'init':
        return { ...scene, seq: scene.seq + 1, values: count(p.values, 'init.values'), step: { kind: 'table' } };
      case 'filter': {
        const match = { compared: count(p.compared, 'filter.compared'), matched: indices(p.matched, 'filter.matched') };
        if (p.where === 'source') {
          return { ...scene, seq: scene.seq + 1, sourceMatch: match, step: { kind: 'filter', where: 'source' } };
        }
        if (p.where === 'target') {
          return { ...scene, seq: scene.seq + 1, targetMatch: match, step: { kind: 'filter', where: 'target' } };
        }
        throw new Error(`atomicCellScene: filter.where 를 모른다 — ${String(p.where)}`);
      }
      case 'unpack': {
        const row = count(p.row, 'unpack.row');
        const from = scene.source.rows[row];
        if (!from) throw new Error(`atomicCellScene: 원래 표에 ${row} 번 줄이 없다`);
        const name = str(from[0], `source.rows[${row}][0]`);
        const parts = strs(p.parts, 'unpack.parts');
        const start = scene.flat.length;
        return {
          ...scene,
          seq: scene.seq + 1,
          flat: [...scene.flat, ...parts.map((value) => ({ name, value, from: row }))],
          unpacked: [...scene.unpacked, row],
          step: { kind: 'unpack', row, start, count: parts.length },
        };
      }
      default:
        throw new Error(`atomicCellScene: 모르는 이벤트 — ${event.type}`);
    }
  },
};
