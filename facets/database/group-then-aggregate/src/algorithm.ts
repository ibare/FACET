/**
 * group-then-aggregate — GROUP BY 와 집계가 여러 줄을 한 줄로 접는 조각.
 *
 * 알고리즘은 SQL 을 파싱하지 않는다. 표 · 묶는 열 · 더하는 열은 구조로 `initialData` 에 있고,
 * 화면의 SQL 글자는 보이기용 자료다.
 *
 * 규약
 * - 묶는 열쇠는 `groupBy` 열의 값이 **같은가** 하나다.
 * - 묶음 안의 줄 차례는 원래 표의 줄 차례.
 * - 묶음의 차례는 `ORDER BY <groupBy>` — 글자 차례(코드 단위 견줌, sqlite 의 BINARY 와 같다).
 * - n = 묶음의 줄 수(COUNT(*)), total = 묶음 `sumOf` 값의 합(SUM).
 *
 * 이벤트 (ctx.emit)
 * - `init`    { groupCount: number } — silent. 바탕: 묶음이 몇인지(화면의 기둥 수). 걸음 0 을 갈아 끼운다
 * - `gather`  { groups: { key: string; ids: number[] }[] }
 *              같은 열쇠의 줄이 한데 모인다. 한 걸음에 모두. groups 는 ORDER BY 차례
 * - `fold`    { group: number; key: string; n: number; total: number; parts: number[] }
 *              group 번째 묶음이 한 줄로 접힌다. parts 는 더한 값들(묶음 안 줄 차례)
 * gather · fold 는 silent 아님.
 *
 * 걸음: 처음(걸음 0) → gather → fold × 묶음 수.
 * 걸음 0 이 이미 표와 SQL 을 보이므로 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OrderRow = Record<string, string | number>;

export type GroupThenAggregateFacetData = {
  type: 'group-then-aggregate';
  stepMs: number;
  /** 표 이름 (SQL 식별자 — 자료) */
  table: string;
  /** 표의 열 이름, 화면 차례 */
  columns: string[];
  /** 줄. 사양이 적은 차례 */
  rows: OrderRow[];
  /** 줄을 가리키는 열 (id) */
  idColumn: string;
  /** GROUP BY 열 */
  groupBy: string;
  /** SUM 을 셈하는 열 */
  sumOf: string;
  /** 결과의 열 이름 — [묶는 열, COUNT(*) 별칭, SUM 별칭] */
  resultColumns: [string, string, string];
  /** 화면에 보일 SQL 줄 */
  sql: string[];
};

export type GroupOf = { key: string; ids: number[]; parts: number[] };

function fail(msg: string): never {
  throw new Error(`group-then-aggregate: ${msg}`);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/** initialData 를 좁힌다. 모르는 열 · 빈 칸 · 겹친 id 는 던진다 (C6). */
export function readGroupThenAggregateData(raw: unknown): GroupThenAggregateFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'group-then-aggregate') fail(`type 이 다르다: ${String(d.type)}`);
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) fail('stepMs 가 양수가 아니다');
  const table = d.table;
  if (typeof table !== 'string' || table === '') fail('table 이 없다');
  const columns = d.columns;
  if (!isStringArray(columns) || columns.length === 0) fail('columns 가 글자 목록이 아니다');
  const idColumn = d.idColumn;
  const groupBy = d.groupBy;
  const sumOf = d.sumOf;
  for (const [name, col] of [
    ['idColumn', idColumn],
    ['groupBy', groupBy],
    ['sumOf', sumOf],
  ] as const) {
    if (typeof col !== 'string' || !columns.includes(col)) fail(`${name} 가 표의 열이 아니다: ${String(col)}`);
  }
  const resultColumns = d.resultColumns;
  if (!isStringArray(resultColumns) || resultColumns.length !== 3) fail('resultColumns 는 이름 셋이다');
  if (resultColumns[0] !== groupBy) fail('resultColumns 의 첫 열은 묶는 열이다');
  const sql = d.sql;
  if (!isStringArray(sql) || sql.length === 0) fail('sql 이 글자 목록이 아니다');
  const rawRows = d.rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) fail('rows 가 비었다');
  const seen = new Set<number>();
  const rows: OrderRow[] = rawRows.map((r: unknown, i: number) => {
    if (typeof r !== 'object' || r === null) fail(`줄 ${i} 가 객체가 아니다`);
    const src = r as Record<string, unknown>;
    const row: OrderRow = {};
    for (const c of columns) {
      const v = src[c];
      if (typeof v !== 'string' && typeof v !== 'number') fail(`줄 ${i} 의 ${c} 칸이 비었다`);
      row[c] = v;
    }
    const id = row[idColumn as string];
    if (typeof id !== 'number' || !Number.isInteger(id)) fail(`줄 ${i} 의 id 가 정수가 아니다`);
    if (seen.has(id)) fail(`id ${id} 가 겹친다`);
    seen.add(id);
    if (typeof row[groupBy as string] !== 'string') fail(`줄 ${i} 의 ${String(groupBy)} 가 글자가 아니다`);
    const amt = row[sumOf as string];
    if (typeof amt !== 'number' || !Number.isInteger(amt)) fail(`줄 ${i} 의 ${String(sumOf)} 가 정수가 아니다`);
    return row;
  });
  return {
    type: 'group-then-aggregate',
    stepMs,
    table,
    columns: [...columns],
    rows,
    idColumn: idColumn as string,
    groupBy: groupBy as string,
    sumOf: sumOf as string,
    resultColumns: [resultColumns[0], resultColumns[1], resultColumns[2]] as [string, string, string],
    sql: [...sql],
  };
}

/** ORDER BY 의 글자 차례 — 코드 단위 견줌 (로캘 무관). */
function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 같은 열쇠끼리 묶는다. 묶음 안은 표의 줄 차례, 묶음은 ORDER BY 차례. */
export function groupRows(data: GroupThenAggregateFacetData): GroupOf[] {
  const byKey = new Map<string, GroupOf>();
  for (const row of data.rows) {
    const key = row[data.groupBy];
    const id = row[data.idColumn];
    const amt = row[data.sumOf];
    if (typeof key !== 'string' || typeof id !== 'number' || typeof amt !== 'number') {
      fail(`줄의 칸 모양이 다르다: ${JSON.stringify(row)}`);
    }
    let g = byKey.get(key);
    if (g === undefined) {
      g = { key, ids: [], parts: [] };
      byKey.set(key, g);
    }
    g.ids.push(id);
    g.parts.push(amt);
  }
  return [...byKey.values()].sort((a, b) => compareKeys(a.key, b.key));
}

export async function groupThenAggregate(
  context: FacetContext<GroupThenAggregateFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<GroupThenAggregateFacetData>;
  const data = readGroupThenAggregateData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const groups = groupRows(data);
  await ctx.emit({ type: 'init', payload: { groupCount: groups.length }, silent: true });

  // 걸음 0 은 표와 SQL 을 이미 보인다 — 읽을 틈을 두고 모은다.
  if (!(await pause())) return;
  await ctx.emit({
    type: 'gather',
    payload: { groups: groups.map((g) => ({ key: g.key, ids: [...g.ids] })) },
  });

  for (let i = 0; i < groups.length; i += 1) {
    if (!(await pause())) return;
    const g = groups[i];
    if (g === undefined) fail(`묶음 ${i} 가 없다`);
    const total = g.parts.reduce((s, v) => s + v, 0);
    await ctx.emit({
      type: 'fold',
      payload: { group: i, key: g.key, n: g.ids.length, total, parts: [...g.parts] },
    });
  }
}
