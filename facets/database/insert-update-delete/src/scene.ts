import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readInsertUpdateDeleteData, type Cell, type CompareOp } from './algorithm.js';

/** 표의 한 줄. key 는 줄이 표에 있는 동안 바뀌지 않는 번호다. */
export type SceneRow = { key: number; values: Cell[] };
export type SceneWhere = { column: string; op: CompareOp; value: number };
export type SceneCheck = { key: number; value: number; hit: boolean };
export type SceneChange = { key: number; before: number; after: number };
export type SceneRemoved = { key: number; index: number; values: Cell[] };

/** 이번 걸음 — 무엇이 일어났는지와 그 계기값. */
export type SceneStep =
  | { kind: 'start' }
  | { kind: 'insert'; stmt: number; key: number }
  | { kind: 'judge'; stmt: number; matched: number; checks: SceneCheck[] }
  | { kind: 'update'; stmt: number; column: number; changes: SceneChange[] }
  | { kind: 'delete'; stmt: number; removed: SceneRemoved[] };

export type InsertUpdateDeleteScene = {
  /** 바탕 — initial 이 한 번 정한다. */
  table: string;
  columns: string[];
  sql: string[];
  wheres: (SceneWhere | null)[];
  /** 표가 가장 많이 가질 수 있는 줄 수 (처음 줄 + INSERT 문 수). 세로 간격을 정한다. */
  capacity: number;
  /** 자취 — 걸음이 쌓는다. */
  rows: SceneRow[];
  affected: (number | null)[];
  /** 이번 걸음. */
  step: SceneStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function int(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`insert-update-delete 장면: ${name} 가 정수가 아니다`);
  }
  return v;
}

function list(v: unknown, name: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`insert-update-delete 장면: ${name} 가 목록이 아니다`);
  return v;
}

function cell(v: unknown, name: string): Cell {
  if (typeof v === 'string') return v;
  return int(v, name);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) {
    throw new Error(`insert-update-delete 장면: ${event.type} 에 payload 가 없다`);
  }
  return event.payload;
}

function stmtOf(p: Record<string, unknown>, scene: InsertUpdateDeleteScene): number {
  const stmt = int(p.stmt, 'stmt');
  if (stmt < 0 || stmt >= scene.sql.length) throw new Error(`insert-update-delete 장면: 없는 문 ${stmt}`);
  return stmt;
}

function withAffected(scene: InsertUpdateDeleteScene, stmt: number, n: number): (number | null)[] {
  return scene.affected.map((a, i) => (i === stmt ? n : a));
}

export const insertUpdateDeleteScene: ScenePlan<InsertUpdateDeleteScene> = {
  initial(initialData: unknown): InsertUpdateDeleteScene {
    const data = readInsertUpdateDeleteData(initialData);
    const inserts = data.statements.filter((s) => s.kind === 'insert').length;
    return {
      table: data.table,
      columns: [...data.columns],
      sql: data.statements.map((s) => s.sql),
      wheres: data.statements.map((s) => (s.kind === 'insert' ? null : { ...s.where })),
      capacity: data.rows.length + inserts,
      rows: data.rows.map((values, key) => ({ key, values: [...values] })),
      affected: data.statements.map(() => null),
      step: { kind: 'start' },
    };
  },

  reduce(scene: InsertUpdateDeleteScene, event: FacetRuntimeEvent): InsertUpdateDeleteScene {
    if (event.type === 'insert') {
      const p = payloadOf(event);
      const stmt = stmtOf(p, scene);
      const key = int(p.key, 'key');
      const values = list(p.values, 'values').map((c, i) => cell(c, `values[${i}]`));
      return {
        ...scene,
        rows: [...scene.rows, { key, values }],
        affected: withAffected(scene, stmt, int(p.affected, 'affected')),
        step: { kind: 'insert', stmt, key },
      };
    }

    if (event.type === 'judge') {
      const p = payloadOf(event);
      const stmt = stmtOf(p, scene);
      const checks = list(p.checks, 'checks').map((c): SceneCheck => {
        if (!isRecord(c) || typeof c.hit !== 'boolean') {
          throw new Error('insert-update-delete 장면: checks 의 모양이 틀렸다');
        }
        return { key: int(c.key, 'checks.key'), value: int(c.value, 'checks.value'), hit: c.hit };
      });
      return {
        ...scene,
        step: { kind: 'judge', stmt, matched: int(p.matched, 'matched'), checks },
      };
    }

    if (event.type === 'update') {
      const p = payloadOf(event);
      const stmt = stmtOf(p, scene);
      const column = int(p.column, 'column');
      const changes = list(p.changes, 'changes').map((c): SceneChange => {
        if (!isRecord(c)) throw new Error('insert-update-delete 장면: changes 의 모양이 틀렸다');
        return {
          key: int(c.key, 'changes.key'),
          before: int(c.before, 'changes.before'),
          after: int(c.after, 'changes.after'),
        };
      });
      const byKey = new Map(changes.map((c) => [c.key, c.after]));
      const rows = scene.rows.map((r) => {
        const after = byKey.get(r.key);
        if (after === undefined) return r;
        const values = [...r.values];
        values[column] = after;
        return { key: r.key, values };
      });
      return {
        ...scene,
        rows,
        affected: withAffected(scene, stmt, int(p.affected, 'affected')),
        step: { kind: 'update', stmt, column, changes },
      };
    }

    if (event.type === 'delete') {
      const p = payloadOf(event);
      const stmt = stmtOf(p, scene);
      const removed = list(p.removed, 'removed').map((c): SceneRemoved => {
        if (!isRecord(c)) throw new Error('insert-update-delete 장면: removed 의 모양이 틀렸다');
        const key = int(c.key, 'removed.key');
        const row = scene.rows.find((r) => r.key === key);
        if (!row) throw new Error(`insert-update-delete 장면: 표에 없는 줄 ${key}`);
        return { key, index: int(c.index, 'removed.index'), values: [...row.values] };
      });
      const gone = new Set(removed.map((r) => r.key));
      return {
        ...scene,
        rows: scene.rows.filter((r) => !gone.has(r.key)),
        affected: withAffected(scene, stmt, int(p.affected, 'affected')),
        step: { kind: 'delete', stmt, removed },
      };
    }

    return scene;
  },
};
