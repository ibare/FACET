/**
 * insert-update-delete — 문 셋(INSERT · UPDATE · DELETE)을 차례로 표에 돌린다.
 *
 * SQL 글자는 파싱하지 않는다. 문의 종류 · WHERE 조건 · 고칠 식을 구조로 들고 셈한다.
 * 각 문의 WHERE 는 **그 문이 도는 순간의 표**를 본다. UPDATE 의 식은 고치기 전 값으로 셈한다.
 * 비교는 엄격하다 (`<` · `>` — 같으면 안 걸린다).
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   - `insert` payload { stmt: number, key: number, values: (string|number)[], affected: number }
 *       새 줄이 표 끝에 들어왔다. key 는 줄의 이어지는 번호(처음 줄 0 부터, 새 줄은 그 뒤)
 *   - `judge`  payload { stmt: number, matched: number, checks: { key: number, value: number, hit: boolean }[] }
 *       UPDATE · DELETE 가 손대기 전에 표의 모든 줄을 WHERE 로 따졌다. value 는 따진 칸의 값
 *   - `update` payload { stmt: number, column: number, affected: number,
 *                        changes: { key: number, before: number, after: number }[] }
 *       걸린 줄 전부의 칸 값이 한꺼번에 바뀌었다. column 은 바뀐 열의 자리
 *   - `delete` payload { stmt: number, affected: number, removed: { key: number, index: number }[] }
 *       걸린 줄 전부가 표에서 빠졌다. index 는 빠지기 직전 표에서의 자리
 *
 * 걸음 0 은 처음 표와 SQL 이다 (장면의 initial 이 initialData 에서 채운다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Cell = string | number;
export type CompareOp = '<' | '>';
export type WhereSpec = { column: string; op: CompareOp; value: number };
export type SetSpec = { column: string; from: string; add: number };

export type StatementSpec =
  | { kind: 'insert'; sql: string; values: Cell[] }
  | { kind: 'update'; sql: string; set: SetSpec; where: WhereSpec }
  | { kind: 'delete'; sql: string; where: WhereSpec };

export type InsertUpdateDeleteFacetData = {
  type: 'insert-update-delete';
  stepMs: number;
  table: string;
  columns: string[];
  rows: Cell[][];
  statements: StatementSpec[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readCell(v: unknown, where: string): Cell {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  throw new Error(`insert-update-delete: ${where} 의 값이 정수 · 글자가 아니다`);
}

function readWhere(v: unknown, where: string): WhereSpec {
  if (!isRecord(v)) throw new Error(`insert-update-delete: ${where}.where 가 없다`);
  const { column, op, value } = v;
  if (typeof column !== 'string') throw new Error(`insert-update-delete: ${where}.where.column 이 없다`);
  if (op !== '<' && op !== '>') throw new Error(`insert-update-delete: ${where}.where.op 를 모른다: ${String(op)}`);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`insert-update-delete: ${where}.where.value 가 정수가 아니다`);
  }
  return { column, op, value };
}

function readStatement(v: unknown, i: number): StatementSpec {
  const at = `statements[${i}]`;
  if (!isRecord(v)) throw new Error(`insert-update-delete: ${at} 가 객체가 아니다`);
  const { kind, sql } = v;
  if (typeof sql !== 'string') throw new Error(`insert-update-delete: ${at}.sql 이 없다`);
  if (kind === 'insert') {
    if (!Array.isArray(v.values)) throw new Error(`insert-update-delete: ${at}.values 가 없다`);
    return { kind, sql, values: v.values.map((c, j) => readCell(c, `${at}.values[${j}]`)) };
  }
  if (kind === 'update') {
    const set = v.set;
    if (!isRecord(set)) throw new Error(`insert-update-delete: ${at}.set 이 없다`);
    const { column, from, add } = set;
    if (typeof column !== 'string' || typeof from !== 'string') {
      throw new Error(`insert-update-delete: ${at}.set 의 열 이름이 없다`);
    }
    if (typeof add !== 'number' || !Number.isInteger(add)) {
      throw new Error(`insert-update-delete: ${at}.set.add 가 정수가 아니다`);
    }
    return { kind, sql, set: { column, from, add }, where: readWhere(v.where, at) };
  }
  if (kind === 'delete') return { kind, sql, where: readWhere(v.where, at) };
  throw new Error(`insert-update-delete: ${at}.kind 를 모른다: ${String(kind)}`);
}

/** initialData 를 좁힌다. 모르는 모양은 던진다 — 걸음이 줄어든 그림을 조용히 내지 않는다. */
export function readInsertUpdateDeleteData(raw: unknown): InsertUpdateDeleteFacetData {
  if (!isRecord(raw)) throw new Error('insert-update-delete: initialData 가 없다');
  const { stepMs, table, columns, rows, statements } = raw;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('insert-update-delete: stepMs 가 없다');
  if (typeof table !== 'string') throw new Error('insert-update-delete: table 이 없다');
  if (!Array.isArray(columns) || !columns.every((c): c is string => typeof c === 'string')) {
    throw new Error('insert-update-delete: columns 가 글자 목록이 아니다');
  }
  if (!Array.isArray(rows)) throw new Error('insert-update-delete: rows 가 없다');
  if (!Array.isArray(statements)) throw new Error('insert-update-delete: statements 가 없다');
  const readRows = rows.map((r, i) => {
    if (!Array.isArray(r) || r.length !== columns.length) {
      throw new Error(`insert-update-delete: rows[${i}] 의 칸 수가 열 수와 다르다`);
    }
    return r.map((c, j) => readCell(c, `rows[${i}][${j}]`));
  });
  const readStatements = statements.map(readStatement);
  for (const [i, s] of readStatements.entries()) {
    if (s.kind === 'insert' && s.values.length !== columns.length) {
      throw new Error(`insert-update-delete: statements[${i}] 의 값 수가 열 수와 다르다`);
    }
  }
  return {
    type: 'insert-update-delete',
    stepMs,
    table,
    columns: [...columns],
    rows: readRows,
    statements: readStatements,
  };
}

/** 열 이름의 자리. 없는 이름은 던진다. */
export function columnIndex(columns: readonly string[], name: string): number {
  const i = columns.indexOf(name);
  if (i < 0) throw new Error(`insert-update-delete: 없는 열: ${name}`);
  return i;
}

function numberCell(values: readonly Cell[], col: number, name: string): number {
  const v = values[col];
  if (typeof v !== 'number') throw new Error(`insert-update-delete: ${name} 칸이 수가 아니다`);
  return v;
}

function compare(left: number, op: CompareOp, right: number): boolean {
  if (op === '<') return left < right;
  return left > right;
}

type LiveRow = { key: number; values: Cell[] };

export async function insertUpdateDelete(
  ctx: FacetContext<InsertUpdateDeleteFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<InsertUpdateDeleteFacetData>;
  const data = readInsertUpdateDeleteData(ctx.data);
  const { stepMs, columns } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let rows: LiveRow[] = data.rows.map((values, key) => ({ key, values: [...values] }));
  let nextKey = rows.length;

  /** 표의 모든 줄을 WHERE 로 따진다 — 손대기 전에 전부. */
  async function judge(stmt: number, where: WhereSpec): Promise<LiveRow[]> {
    const col = columnIndex(columns, where.column);
    const checks = rows.map((r) => {
      const value = numberCell(r.values, col, where.column);
      return { key: r.key, value, hit: compare(value, where.op, where.value) };
    });
    const hitKeys = new Set(checks.filter((c) => c.hit).map((c) => c.key));
    await ctx.emit({ type: 'judge', payload: { stmt, matched: hitKeys.size, checks } });
    return rows.filter((r) => hitKeys.has(r.key));
  }

  // 걸음 0(처음 표와 SQL)은 읽을 것이 있는 화면이라 문마다 앞에 stepMs 를 둔다.
  for (const [stmt, s] of data.statements.entries()) {
    if (!(await pause())) return;

    if (s.kind === 'insert') {
      const row = { key: nextKey, values: [...s.values] };
      nextKey += 1;
      rows = [...rows, row];
      await ctx.emit({
        type: 'insert',
        payload: { stmt, key: row.key, values: [...row.values], affected: 1 },
      });
      continue;
    }

    const hits = await judge(stmt, s.where);
    if (!(await pause())) return;

    if (s.kind === 'update') {
      const col = columnIndex(columns, s.set.column);
      const fromCol = columnIndex(columns, s.set.from);
      const hitKeys = new Set(hits.map((r) => r.key));
      // 식은 고치기 전 값으로 셈한다 — 바꾸기 전에 전부 셈해 둔다.
      const changes = hits.map((r) => {
        const before = numberCell(r.values, col, s.set.column);
        const after = numberCell(r.values, fromCol, s.set.from) + s.set.add;
        return { key: r.key, before, after };
      });
      const afterByKey = new Map(changes.map((c) => [c.key, c.after]));
      rows = rows.map((r) => {
        if (!hitKeys.has(r.key)) return r;
        const after = afterByKey.get(r.key);
        if (after === undefined) throw new Error(`insert-update-delete: 줄 ${r.key} 의 새 값이 없다`);
        const values = [...r.values];
        values[col] = after;
        return { key: r.key, values };
      });
      await ctx.emit({
        type: 'update',
        payload: { stmt, column: col, affected: changes.length, changes },
      });
      continue;
    }

    // delete
    const hitKeys = new Set(hits.map((r) => r.key));
    const removed = rows
      .map((r, index) => ({ key: r.key, index }))
      .filter((r) => hitKeys.has(r.key));
    rows = rows.filter((r) => !hitKeys.has(r.key));
    await ctx.emit({
      type: 'delete',
      payload: { stmt, affected: removed.length, removed },
    });
  }
}
