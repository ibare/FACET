/**
 * schema-defines-shape — CREATE TABLE 로 정한 모양이 들어오는 줄을 맞춰 보고 튕겨 낸다.
 *
 * 엄격 모형(표준 SQL · PostgreSQL 쪽): 형이 안 맞는 값을 바꾸지 않고 문 전체를 거절한다.
 * INSERT 를 적힌 차례로 하나씩 시도한다. 값은 열 차례로 맞춰 보고, 처음 어긋난 칸에서 멈춘다.
 *
 * 판정 (열 차례로)
 *   - 값이 NULL — NOT NULL 인 열에서만 어긋남(`notNull`). NOT NULL 이 없는 열의 NULL 은 맞다
 *   - INT 열 — 정수가 아닌 값이면 어긋남(`type`)
 *   - VARCHAR(n) 열 — 글자가 아닌 값이면 어긋남(`type`), 글자 수가 n 을 **넘으면** 어긋남(`length`)
 *
 * 이벤트 (INSERT 하나에 하나. 모두 silent 아님 — 걸음 하나씩)
 *   insert  payload { index: number; rows: number; nulls: number[] }
 *           index = inserts 의 몇 번째 문(0 부터) · rows = 들어간 뒤 표의 줄 수 ·
 *           nulls = NULL 을 받아 준 열의 차례(NOT NULL 이 없는 열)
 *   reject  payload { index: number; column: number; rule: 'notNull' | 'type' | 'length';
 *                     length: number | null; rows: number }
 *           column = 어긋난 열의 차례 · rule = 어긴 모양 · length = rule 이 length 일 때 값의 글자 수,
 *           아니면 null · rows = 표의 줄 수(거절된 문은 표를 바꾸지 않는다)
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다(빈 표와 SQL). 읽을 것이 있는 화면이라
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ColumnType = 'INT' | 'VARCHAR';

export type ColumnShape = {
  name: string;
  type: ColumnType;
  /** VARCHAR 의 글자 수 한도. INT 는 null */
  length: number | null;
  notNull: boolean;
};

export type CellValue = number | string | null;

export type InsertTry = {
  /** 화면에 보일 SQL 글자 (보이기용 자료. 파싱하지 않는다) */
  sql: string;
  values: CellValue[];
};

export type SchemaDefinesShapeFacetData = {
  type: 'schema-defines-shape';
  stepMs: number;
  table: string;
  /** CREATE TABLE 문의 줄들 (보이기용 자료) */
  schema: string[];
  columns: ColumnShape[];
  inserts: InsertTry[];
};

export type ShapeRule = 'notNull' | 'type' | 'length';

export type Violation = { column: number; rule: ShapeRule; length: number | null };

/** 글자 수 — 코드 단위가 아니라 글자 단위로 센다 */
function charCount(s: string): number {
  return Array.from(s).length;
}

/** 한 칸이 열의 모양에 맞는지. 맞으면 null */
function cellViolation(col: ColumnShape, v: CellValue, column: number): Violation | null {
  if (v === null) {
    return col.notNull ? { column, rule: 'notNull', length: null } : null;
  }
  if (col.type === 'INT') {
    if (typeof v !== 'number' || !Number.isInteger(v)) return { column, rule: 'type', length: null };
    return null;
  }
  if (col.type === 'VARCHAR') {
    if (typeof v !== 'string') return { column, rule: 'type', length: null };
    if (col.length === null) throw new Error(`열 ${col.name}: VARCHAR 인데 글자 수 한도가 없다`);
    const n = charCount(v);
    if (n > col.length) return { column, rule: 'length', length: n };
    return null;
  }
  throw new Error(`열 ${col.name}: 모르는 형 ${String(col.type)}`);
}

/** 열 차례로 맞춰 보고 처음 어긋난 칸을 돌려준다. 다 맞으면 null */
export function firstViolation(columns: ColumnShape[], values: CellValue[]): Violation | null {
  if (values.length !== columns.length) {
    throw new Error(`값 ${values.length} 개 · 열 ${columns.length} 개 — 수가 다르다`);
  }
  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];
    const v = values[c];
    if (col === undefined || v === undefined) throw new Error(`열 ${c} 의 모양이나 값이 없다`);
    const bad = cellViolation(col, v, c);
    if (bad !== null) return bad;
  }
  return null;
}

export async function schemaDefinesShape(
  context: FacetContext<SchemaDefinesShapeFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SchemaDefinesShapeFacetData>;
  const { columns, inserts, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let rows = 0;
  for (let index = 0; index < inserts.length; index++) {
    if (!(await pause())) return;
    const attempt = inserts[index];
    if (attempt === undefined) throw new Error(`INSERT ${index} 이 없다`);
    const bad = firstViolation(columns, attempt.values);
    if (bad === null) {
      rows += 1;
      const nulls: number[] = [];
      attempt.values.forEach((v, c) => {
        if (v === null) nulls.push(c);
      });
      await ctx.emit({ type: 'insert', payload: { index, rows, nulls } });
    } else {
      await ctx.emit({
        type: 'reject',
        payload: { index, column: bad.column, rule: bad.rule, length: bad.length, rows },
      });
    }
  }
}
