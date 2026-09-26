/**
 * atomic-cell — 칸 하나에 값 하나 (제1정규형).
 *
 * 한 칸에 뭉쳐 있던 값들을 구분자로 갈라 저마다 제 줄로 편다. 펴기 전에는
 * 조건이 칸 글자 **전체**와 견주어 줄을 집어내지 못하고, 편 뒤에는 같은 조건이
 * 줄을 집어낸다.
 *
 * 셈:
 *   - 펴기 = 칸 글자를 `separator` 로 가른다. 편 줄의 차례 = 원래 줄 차례, 그 안에서 칸 안의 차례
 *   - 조건 = 칸 값 전체가 같다 (대소문자 구분, 부분 글자 찾기 아님)
 *   - 원래 표의 열쇠와 편 표의 열쇠가 겹치지 않는지 확인하고, 겹치면 던진다
 *
 * 이벤트:
 *   init    silent  { values: number }
 *                   편 뒤 줄 수 — 아래 표가 차지할 자리(바탕). 걸음 0 을 갈아 끼운다
 *   filter          { where: 'source' | 'target', compared: number, matched: number[] }
 *                   조건을 한 표의 줄마다 견준다. matched 는 맞은 줄의 자리(데이터 차례)
 *   unpack          { row: number, parts: string[] }
 *                   원래 표의 줄 하나를 편다. parts 는 칸에서 풀려 나온 값 (칸 안의 차례)
 *
 * 걸음: 표(걸음 0) → filter source → unpack × 원래 줄 수 → filter target
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AtomicCellCondition = { column: string; value: string };

export type AtomicCellTable = { table: string; columns: string[]; key: string[] };

export type AtomicCellFacetData = {
  type: 'atomic-cell';
  stepMs: number;
  source: AtomicCellTable & { rows: string[][] };
  target: AtomicCellTable;
  separator: string;
  before: AtomicCellCondition;
  after: AtomicCellCondition;
};

function need(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`atomic-cell: ${what} 가 빈 값이다`);
  return value;
}

function columnIndex(table: AtomicCellTable, column: string): number {
  const at = table.columns.indexOf(column);
  if (at < 0) throw new Error(`atomic-cell: 표 ${table.table} 에 열 ${column} 이 없다`);
  return at;
}

/** 열쇠 열들의 값이 겹치는 줄이 있으면 던진다. */
function checkKey(table: AtomicCellTable, rows: string[][]): void {
  if (table.key.length === 0) throw new Error(`atomic-cell: 표 ${table.table} 에 열쇠가 없다`);
  const at = table.key.map((k) => columnIndex(table, k));
  const seen = new Set<string>();
  for (const row of rows) {
    const id = JSON.stringify(at.map((i) => row[i]));
    if (seen.has(id)) throw new Error(`atomic-cell: 표 ${table.table} 의 열쇠 ${id} 가 겹친다`);
    seen.add(id);
  }
}

/** 칸 글자를 구분자로 가른다. 갈라진 조각이 비면 던진다. */
function unpackCell(cell: string, separator: string, where: string): string[] {
  const parts = cell.split(separator);
  parts.forEach((p, i) => need(p, `${where} 의 ${i} 번 조각`));
  return parts;
}

export async function atomicCell(ctx: FacetContext<AtomicCellFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<AtomicCellFacetData>;
  const { source, target, separator, before, after, stepMs } = ctx.data;
  if (typeof stepMs !== 'number' || !(stepMs >= 0)) throw new Error('atomic-cell: stepMs 가 수가 아니다');
  need(separator, 'separator');
  if (source.columns.length !== 2 || target.columns.length !== 2) {
    throw new Error('atomic-cell: 두 표 모두 열이 둘이어야 한다 (이름 열 · 값 열)');
  }
  const packedAt = columnIndex(source, before.column);
  const valueAt = columnIndex(target, after.column);
  if (packedAt !== 1 || valueAt !== 1) throw new Error('atomic-cell: 조건의 열은 두 표 모두 둘째 열이어야 한다');
  need(before.value, 'before.value');
  need(after.value, 'after.value');
  source.rows.forEach((row, r) => {
    if (row.length !== 2) throw new Error(`atomic-cell: ${source.table} 의 ${r} 번 줄 칸 수가 ${row.length} 이다`);
    row.forEach((cell, c) => need(cell, `${source.table} 의 ${r} 번 줄 ${c} 번 칸`));
  });
  checkKey(source, source.rows);

  // 편 표를 먼저 셈해 열쇠 겹침을 확인한다 — 걸음을 밟기 전에 데이터가 틀린 것을 드러낸다.
  const unpacked = source.rows.map((row, r) => unpackCell(row[1]!, separator, `${source.table} 의 ${r} 번 줄`));
  const flat: string[][] = [];
  source.rows.forEach((row, r) => {
    for (const part of unpacked[r]!) flat.push([row[0]!, part]);
  });
  checkKey(target, flat);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function matchedRows(rows: string[][], condition: AtomicCellCondition, at: number): number[] {
    const out: number[] = [];
    rows.forEach((row, i) => {
      if (row[at] === condition.value) out.push(i);
    });
    return out;
  }

  await ctx.emit({ type: 'init', payload: { values: flat.length }, silent: true });

  // 걸음 0 은 원래 표가 이미 서 있는 화면이라 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({
    type: 'filter',
    payload: { where: 'source', compared: source.rows.length, matched: matchedRows(source.rows, before, packedAt) },
  });

  for (let r = 0; r < source.rows.length; r += 1) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'unpack', payload: { row: r, parts: unpacked[r] } });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'filter',
    payload: { where: 'target', compared: flat.length, matched: matchedRows(flat, after, valueAt) },
  });
}
