/**
 * schema-defines-shape 장면 — 이벤트를 잇기만 한다. 판정은 알고리즘이 했다.
 *
 * 바탕: 표 이름 · CREATE TABLE 줄 · 열의 모양 · 시도할 INSERT (initial 이 initialData 에서 베낀다)
 * 자취: 들어간 문의 차례(rows) · 튕겨 난 문과 그 어긋남(rejected)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { CellValue, ColumnShape, InsertTry, ShapeRule } from './algorithm.js';

export type RejectedTry = { index: number; column: number; rule: ShapeRule; length: number | null };

export type SchemaStep =
  | { kind: 'insert'; index: number; rows: number; nulls: number[] }
  | { kind: 'reject'; index: number; column: number; rule: ShapeRule; length: number | null; rows: number };

export type SchemaScene = {
  table: string;
  schema: string[];
  columns: ColumnShape[];
  inserts: InsertTry[];
  /** 들어간 문의 차례 — 표의 줄 차례와 같다 */
  rows: number[];
  rejected: RejectedTry[];
  step: SchemaStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readCell(v: unknown): CellValue {
  if (v === null || typeof v === 'number' || typeof v === 'string') return v;
  throw new Error(`값으로 읽을 수 없다: ${String(v)}`);
}

function readColumn(v: unknown): ColumnShape {
  if (!isRecord(v)) throw new Error('열 모양이 객체가 아니다');
  const { name, type, length, notNull } = v;
  if (typeof name !== 'string') throw new Error('열 이름이 없다');
  if (type !== 'INT' && type !== 'VARCHAR') throw new Error(`열 ${name}: 모르는 형`);
  if (length !== null && typeof length !== 'number') throw new Error(`열 ${name}: 길이가 수가 아니다`);
  if (typeof notNull !== 'boolean') throw new Error(`열 ${name}: notNull 이 없다`);
  return { name, type, length, notNull };
}

function readInsert(v: unknown): InsertTry {
  if (!isRecord(v)) throw new Error('INSERT 가 객체가 아니다');
  const { sql, values } = v;
  if (typeof sql !== 'string' || !Array.isArray(values)) throw new Error('INSERT 의 sql · values 가 없다');
  return { sql, values: values.map(readCell) };
}

function readRule(v: unknown): ShapeRule {
  if (v === 'notNull' || v === 'type' || v === 'length') return v;
  throw new Error(`모르는 어긋남: ${String(v)}`);
}

function readInt(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}

export const schemaDefinesShapeScene: ScenePlan<SchemaScene> = {
  initial(initialData: unknown): SchemaScene {
    if (!isRecord(initialData)) throw new Error('initialData 가 없다');
    const { table, schema, columns, inserts } = initialData;
    if (typeof table !== 'string') throw new Error('표 이름이 없다');
    if (!Array.isArray(schema) || !schema.every((l): l is string => typeof l === 'string')) {
      throw new Error('CREATE TABLE 줄이 없다');
    }
    if (!Array.isArray(columns) || !Array.isArray(inserts)) throw new Error('열 · INSERT 가 없다');
    return {
      table,
      schema: [...schema],
      columns: columns.map(readColumn),
      inserts: inserts.map(readInsert),
      rows: [],
      rejected: [],
      step: null,
    };
  },

  reduce(scene: SchemaScene, event: FacetRuntimeEvent): SchemaScene {
    const p = event.payload;
    if (event.type === 'insert') {
      if (!isRecord(p) || !Array.isArray(p.nulls)) throw new Error('insert payload 가 모자라다');
      const index = readInt(p, 'index');
      const nulls = p.nulls.map((n) => {
        if (typeof n !== 'number') throw new Error('nulls 에 수가 아닌 것');
        return n;
      });
      return {
        ...scene,
        rows: [...scene.rows, index],
        step: { kind: 'insert', index, rows: readInt(p, 'rows'), nulls },
      };
    }
    if (event.type === 'reject') {
      if (!isRecord(p)) throw new Error('reject payload 가 없다');
      const index = readInt(p, 'index');
      const column = readInt(p, 'column');
      const rule = readRule(p.rule);
      const len = p.length;
      if (len !== null && typeof len !== 'number') throw new Error('payload.length 가 수 · null 이 아니다');
      return {
        ...scene,
        rejected: [...scene.rejected, { index, column, rule, length: len }],
        step: { kind: 'reject', index, column, rule, length: len, rows: readInt(p, 'rows') },
      };
    }
    throw new Error(`모르는 이벤트: ${event.type}`);
  },
};
