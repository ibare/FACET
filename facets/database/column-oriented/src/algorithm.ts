/**
 * column-oriented — 한 칸만 묻는 질의에서, 줄 방향으로 담은 표와 칸 방향으로 담은 표는
 * 디스크 쪽(page)을 얼마나 읽는가.
 *
 * 규약 (사양 그대로):
 *   - 줄 방향: 줄을 데이터 차례로, 한 줄 안은 열 차례대로 이어 적고 `pageCells` 칸마다 쪽을 끊는다.
 *   - 열 방향: 열마다 **따로** 쪽을 연다 (두 열이 한 쪽을 나눠 쓰지 않는다). 쪽 안의 차례는 줄 차례.
 *   - 읽기의 단위는 쪽이다 — 쪽 안의 칸 하나만 필요해도 쪽 전체가 들려 온다.
 *     "딸려 온 칸" = 읽은 쪽들의 찬 칸 수. "쓴 칸" = 그중 묻는 열의 칸 수.
 *   - 질의는 `sql` 을 읽어 얻는다. `SELECT SUM(<열>) FROM <표>` 꼴만 안다 — 그 밖의 꼴은 던진다.
 *   - 한 걸음 = 담기 한 번 또는 읽기 한 번. 걸음 0 은 표 (장면의 initial 이 initialData 에서 채운다).
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음):
 *   store-rows     { pages: [row, col][][] }
 *                  줄 방향으로 쪽에 담았다. 쪽마다 [줄 번호, 열 번호] 칸 목록 (0 부터)
 *   store-columns  { pages: { col: number; cells: [row, col][] }[] }
 *                  열 방향으로 떼어 모아 쪽에 담았다
 *   read-rows      { column: number; pages: number[]; brought: number; used: number; sum: number }
 *                  줄 방향이 질의에 쪽을 읽었다. pages = 읽은 쪽 번호, brought = 딸려 온 칸,
 *                  used = 쓴 칸, sum = 읽은 쪽에서 셈한 합
 *   read-columns   (read-rows 와 같은 꼴) 열 방향이 질의에 쪽을 읽었다
 *   done           { sum: number }  두 쪽의 합이 같음을 확인했다 (다르면 던진다)
 *
 * ctx.metric 을 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CellValue = string | number;

export interface ColumnOrientedFacetData {
  type: 'column-oriented';
  stepMs: number;
  table: string;
  columns: string[];
  rows: CellValue[][];
  pageCells: number;
  sql: string;
}

export type CellRef = [number, number];

export interface ColumnPageRef {
  col: number;
  cells: CellRef[];
}

export interface ReadCount {
  column: number;
  pages: number[];
  brought: number;
  used: number;
  sum: number;
}

/** 데이터의 모양을 확인한다. 모르는 모양은 던진다 (C6). */
function checkData(d: ColumnOrientedFacetData): void {
  if (!Array.isArray(d.columns) || d.columns.length === 0) throw new Error('columns 가 없다');
  if (!Array.isArray(d.rows) || d.rows.length === 0) throw new Error('rows 가 없다');
  if (!Number.isInteger(d.pageCells) || d.pageCells <= 0) throw new Error(`pageCells 가 양의 정수가 아니다: ${String(d.pageCells)}`);
  d.rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== d.columns.length) {
      throw new Error(`줄 ${r + 1} 의 칸 수가 열 수 ${d.columns.length} 와 다르다`);
    }
  });
}

/** `SELECT SUM(<열>) FROM <표>` 에서 열 번호를 얻는다. */
export function queryColumn(d: ColumnOrientedFacetData): number {
  const m = /^SELECT SUM\((\w+)\) FROM (\w+)$/.exec(d.sql);
  if (m === null) throw new Error(`모르는 질의 꼴: ${d.sql}`);
  const [, col, table] = m;
  if (table !== d.table) throw new Error(`질의의 표 ${String(table)} 가 데이터의 표 ${d.table} 와 다르다`);
  const c = d.columns.indexOf(String(col));
  if (c < 0) throw new Error(`질의의 열 ${String(col)} 이 표에 없다`);
  return c;
}

/** 줄 방향: 줄을 차례로 이어 적고 pageCells 칸마다 끊는다. */
function rowPagesOf(d: ColumnOrientedFacetData): CellRef[][] {
  const flat: CellRef[] = [];
  d.rows.forEach((row, r) => {
    row.forEach((_, c) => flat.push([r, c]));
  });
  const pages: CellRef[][] = [];
  for (let i = 0; i < flat.length; i += d.pageCells) pages.push(flat.slice(i, i + d.pageCells));
  return pages;
}

/** 열 방향: 열마다 따로 쪽을 연다. 쪽 안은 줄 차례. */
function columnPagesOf(d: ColumnOrientedFacetData): ColumnPageRef[] {
  const pages: ColumnPageRef[] = [];
  d.columns.forEach((_, c) => {
    const cells: CellRef[] = d.rows.map((_row, r): CellRef => [r, c]);
    for (let i = 0; i < cells.length; i += d.pageCells) pages.push({ col: c, cells: cells.slice(i, i + d.pageCells) });
  });
  return pages;
}

function valueAt(d: ColumnOrientedFacetData, [r, c]: CellRef): CellValue {
  const row = d.rows[r];
  if (row === undefined) throw new Error(`줄 ${r + 1} 이 데이터에 없다`);
  const v = row[c];
  if (v === undefined) throw new Error(`줄 ${r + 1} 에 열 ${c + 1} 이 없다`);
  return v;
}

/** 묻는 열을 담은 쪽만 읽는다 — 쪽 단위라 쪽의 찬 칸이 전부 딸려 온다. */
function readPages(d: ColumnOrientedFacetData, pages: CellRef[][], column: number): ReadCount {
  const read: number[] = [];
  let brought = 0;
  let used = 0;
  let sum = 0;
  pages.forEach((cells, p) => {
    if (!cells.some(([, c]) => c === column)) return;
    read.push(p);
    brought += cells.length;
    for (const cell of cells) {
      if (cell[1] !== column) continue;
      const v = valueAt(d, cell);
      if (typeof v !== 'number') throw new Error(`열 ${d.columns[column] ?? column} 의 값이 수가 아니다: ${String(v)}`);
      used += 1;
      sum += v;
    }
  });
  return { column, pages: read, brought, used, sum };
}

export async function columnOriented(context: FacetContext<ColumnOrientedFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ColumnOrientedFacetData>;
  const d = ctx.data;
  checkData(d);
  const column = queryColumn(d);
  const stepMs = d.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const rowPages = rowPagesOf(d);
  const colPages = columnPagesOf(d);

  // 걸음 0 이 이미 표를 보이고 있으니 첫 담기 앞에도 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'store-rows', payload: { pages: rowPages } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'store-columns', payload: { pages: colPages } });

  const rowRead = readPages(d, rowPages, column);
  if (!(await pause())) return;
  await ctx.emit({ type: 'read-rows', payload: rowRead });

  const colRead = readPages(
    d,
    colPages.map((p) => p.cells),
    column,
  );
  if (!(await pause())) return;
  await ctx.emit({ type: 'read-columns', payload: colRead });

  if (rowRead.sum !== colRead.sum) throw new Error(`두 담는 법의 합이 다르다: ${rowRead.sum} · ${colRead.sum}`);
  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { sum: rowRead.sum } });
}
