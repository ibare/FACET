/**
 * foreign-key-points — 외래 키 값은 가리킬 줄을 값으로 찾아간다. 닿을 줄이 없는 값은 튕겨 난다.
 *
 * 걸음 0 은 장면의 `initial()` 이 두 표(고객 · 주문)로 채운다. 알고리즘은 그 화면에
 * 읽을 틈(stepMs)을 준 뒤 주문 줄을 데이터 차례로 하나씩 따라간다.
 *
 * 가리킴은 **값으로** 찾는다 — 부모 표의 자리(몇 번째 줄)가 아니라 외래 키 값과 같은
 * 기본 키 값을 가진 줄이다. 이미 표에 있는 주문 줄은 닿을 줄이 정확히 하나여야 한다
 * (아니면 데이터가 제 선언을 어긴 것이라 던진다). 들어오려는 줄은 닿을 줄이 0 이면
 * 거절, 1 이면 받는다.
 *
 * 이벤트 (전부 silent 아님 — 한 걸음 = emit 하나):
 *   follow  payload { order: number; customer: number; pointed: number }
 *           order    = 자식 표(주문)의 줄 자리 (데이터 차례)
 *           customer = 값이 같은 부모 표(고객) 줄의 자리
 *           pointed  = 이 걸음까지 그 부모 줄을 가리킨 자식 줄 수
 *   insert  payload { matches: number; customer: number | null; accepted: boolean }
 *           matches  = 들어오려는 줄의 외래 키 값과 같은 키를 가진 부모 줄 수
 *           customer = 닿은 부모 줄의 자리 (없으면 null)
 *           accepted = matches 가 1 인가
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FkCell = number | string;

export type FkParentTable = {
  name: string;
  columns: string[];
  /** 기본 키 열 */
  key: string;
  rows: FkCell[][];
};

export type FkChildTable = {
  name: string;
  columns: string[];
  /** 기본 키 열 */
  key: string;
  /** 외래 키 — 이 표의 `column` 이 `table.references` 를 가리킨다 */
  foreignKey: { column: string; table: string; references: string };
  rows: FkCell[][];
};

export type ForeignKeyPointsFacetData = {
  type: 'foreign-key-points';
  stepMs: number;
  parent: FkParentTable;
  child: FkChildTable;
  /** 자식 표에 들어오려는 줄 */
  incoming: FkCell[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readName(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`foreign-key-points: ${where} 는 빈 글자가 아닌 이름이어야 한다`);
  return v;
}

function readCell(v: unknown, where: string): FkCell {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '') return v;
  throw new Error(`foreign-key-points: ${where} 의 칸이 비었거나 셈할 수 없는 값이다`);
}

function readRow(v: unknown, width: number, where: string): FkCell[] {
  if (!Array.isArray(v) || v.length !== width) {
    throw new Error(`foreign-key-points: ${where} 의 칸 수가 열 수 ${width} 와 다르다`);
  }
  return v.map((c, i) => readCell(c, `${where}[${i}]`));
}

function readColumns(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`foreign-key-points: ${where}.columns 가 없다`);
  const cols = v.map((c, i) => readName(c, `${where}.columns[${i}]`));
  if (new Set(cols).size !== cols.length) throw new Error(`foreign-key-points: ${where}.columns 에 같은 이름이 있다`);
  return cols;
}

function readRows(v: unknown, width: number, where: string): FkCell[][] {
  if (!Array.isArray(v)) throw new Error(`foreign-key-points: ${where}.rows 가 없다`);
  return v.map((r, i) => readRow(r, width, `${where}.rows[${i}]`));
}

function columnIndex(columns: string[], name: string, where: string): number {
  const i = columns.indexOf(name);
  if (i < 0) throw new Error(`foreign-key-points: ${where} 열 ${name} 이 표에 없다`);
  return i;
}

/** 기본 키 값이 줄마다 다른지 — 같은 값이 둘이면 선언이 줄과 어긋난 것이라 던진다 */
function assertKeyUnique(rows: FkCell[][], keyAt: number, where: string): void {
  const seen = new Set<FkCell>();
  for (const row of rows) {
    const k = row[keyAt];
    if (k === undefined) throw new Error(`foreign-key-points: ${where} 의 키 칸이 없다`);
    if (seen.has(k)) throw new Error(`foreign-key-points: ${where} 의 기본 키 ${String(k)} 가 두 줄에 있다`);
    seen.add(k);
  }
}

/** initialData 를 좁힌다. 모르는 모양 · 선언과 어긋나는 줄은 던진다 (C6) */
export function readForeignKeyPointsData(raw: unknown): ForeignKeyPointsFacetData {
  if (!isRecord(raw)) throw new Error('foreign-key-points: initialData 가 없다');
  if (raw.type !== 'foreign-key-points') throw new Error('foreign-key-points: initialData.type 이 다르다');
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('foreign-key-points: stepMs 가 없다');

  const p = raw.parent;
  if (!isRecord(p)) throw new Error('foreign-key-points: parent 표가 없다');
  const pColumns = readColumns(p.columns, 'parent');
  const parent: FkParentTable = {
    name: readName(p.name, 'parent.name'),
    columns: pColumns,
    key: readName(p.key, 'parent.key'),
    rows: readRows(p.rows, pColumns.length, 'parent'),
  };
  assertKeyUnique(parent.rows, columnIndex(pColumns, parent.key, 'parent.key'), 'parent');

  const c = raw.child;
  if (!isRecord(c)) throw new Error('foreign-key-points: child 표가 없다');
  const cColumns = readColumns(c.columns, 'child');
  const fk = c.foreignKey;
  if (!isRecord(fk)) throw new Error('foreign-key-points: child.foreignKey 가 없다');
  const child: FkChildTable = {
    name: readName(c.name, 'child.name'),
    columns: cColumns,
    key: readName(c.key, 'child.key'),
    foreignKey: {
      column: readName(fk.column, 'child.foreignKey.column'),
      table: readName(fk.table, 'child.foreignKey.table'),
      references: readName(fk.references, 'child.foreignKey.references'),
    },
    rows: readRows(c.rows, cColumns.length, 'child'),
  };
  columnIndex(cColumns, child.foreignKey.column, 'child.foreignKey.column');
  assertKeyUnique(child.rows, columnIndex(cColumns, child.key, 'child.key'), 'child');
  if (child.foreignKey.table !== parent.name) {
    throw new Error(`foreign-key-points: 외래 키가 가리키는 표 ${child.foreignKey.table} 가 parent 표가 아니다`);
  }
  if (child.foreignKey.references !== parent.key) {
    throw new Error(`foreign-key-points: 외래 키가 가리키는 열 ${child.foreignKey.references} 가 parent 의 기본 키가 아니다`);
  }

  const incoming = readRow(raw.incoming, cColumns.length, 'incoming');
  return { type: 'foreign-key-points', stepMs, parent, child, incoming };
}

/** 부모 표에서 키 값이 `value` 와 같은 줄의 자리 전부 (데이터 차례). 자리가 아니라 값으로 찾는다 */
export function rowsWithKey(parent: FkParentTable, value: FkCell): number[] {
  const at = columnIndex(parent.columns, parent.key, 'parent.key');
  const hits: number[] = [];
  parent.rows.forEach((row, i) => {
    if (row[at] === value) hits.push(i);
  });
  return hits;
}

/** 자식 줄의 외래 키 값 */
export function foreignKeyValue(child: FkChildTable, row: FkCell[]): FkCell {
  const v = row[columnIndex(child.columns, child.foreignKey.column, 'child.foreignKey.column')];
  if (v === undefined) throw new Error('foreign-key-points: 외래 키 칸이 없다');
  return v;
}

export async function foreignKeyPoints(ctx: FacetContext<ForeignKeyPointsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ForeignKeyPointsFacetData>;
  const data = readForeignKeyPointsData(ctx.data);
  const { parent, child, incoming, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const childKeyAt = columnIndex(child.columns, child.key, 'child.key');
  const pointed = parent.rows.map(() => 0);

  // 걸음 0 은 두 표 — 첫 문이 그 화면에 읽을 틈을 준다
  for (let i = 0; i < child.rows.length; i += 1) {
    if (!(await pause())) return;
    const row = child.rows[i];
    if (row === undefined) throw new Error(`foreign-key-points: 주문 줄 ${i} 가 없다`);
    const value = foreignKeyValue(child, row);
    const hits = rowsWithKey(parent, value);
    const customer = hits[0];
    if (hits.length !== 1 || customer === undefined) {
      throw new Error(
        `foreign-key-points: 표에 있는 ${child.name} 줄 ${String(row[childKeyAt])} 의 값 ${String(value)} 과 같은 키의 ${parent.name} 줄이 ${hits.length} 개다`,
      );
    }
    const was = pointed[customer];
    if (was === undefined) throw new Error(`foreign-key-points: 부모 줄 ${customer} 가 없다`);
    pointed[customer] = was + 1;
    await ctx.emit({ type: 'follow', payload: { order: i, customer, pointed: was + 1 } });
  }

  if (!(await pause())) return;
  const incomingKey = incoming[childKeyAt];
  if (incomingKey === undefined) throw new Error('foreign-key-points: 들어오려는 줄의 키 칸이 없다');
  if (child.rows.some((r) => r[childKeyAt] === incomingKey)) {
    // 기본 키가 겹쳐 거절되는 것은 이 조각의 주장이 아니다 — 데이터가 틀렸다
    throw new Error(`foreign-key-points: 들어오려는 줄의 기본 키 ${String(incomingKey)} 가 이미 있다`);
  }
  const hits = rowsWithKey(parent, foreignKeyValue(child, incoming));
  const accepted = hits.length === 1;
  const first = hits[0];
  const customer = accepted && first !== undefined ? first : null;
  await ctx.emit({ type: 'insert', payload: { matches: hits.length, customer, accepted } });
}
