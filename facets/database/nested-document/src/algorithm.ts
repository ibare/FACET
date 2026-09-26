/**
 * nested-document — 표 셋에 흩어진 주문 하나가 문서 하나 안으로 접혀 들어간다.
 *
 * 규약 (사양 그대로):
 *   - 한 걸음 = 줄 하나가 접힌다. 첫 걸음은 뿌리 표(orders)의 줄이 문서의 껍질이 되는 것
 *   - 차례: 뿌리 줄 → embeds 를 적힌 차례로. 각 embed 는 `table.key = 뿌리 줄의 ref` 인 줄을
 *     **표에 적힌 차례대로** 접는다. 배열 칸의 차례 = 이 차례
 *   - 문서의 필드 차례: 뿌리 표의 열 차례(잇는 데만 쓰인 열은 뺀다) → embeds 차례.
 *     접힌 줄의 필드 차례 = 그 표의 열 차례에서 key 열을 뺀 것
 *   - 잇는 데만 쓰인 칸은 문서에 들어가지 않는다 — 접힌 줄의 key 열, 그리고 뿌리 줄의 ref 열 중
 *     뿌리 자신의 열쇠가 아닌 것(바깥을 가리키던 열쇠). 뿌리 줄의 ref 열은 그 embed 가 접힐 때까지
 *     문서 안에 "아직 가리키는 열쇠" 로 남는다
 *   - 셈: 접힌 줄 = 뿌리 1 + 접힌 embed 줄. 사라진 이음 = 접힌 embed 줄 수 (줄마다 열쇠 맞춤 하나).
 *     표에 남은 줄 = 모든 줄 − 접힌 줄
 *
 * 이벤트 (전부 silent 아님):
 *   shell  { table: number; row: number;
 *            fields: { name: string; value: string | number }[];   // 문서에 들어간 칸
 *            links:  { name: string; value: string | number }[] }  // 아직 바깥을 가리키는 열쇠 칸
 *   fold   { table: number; row: number; field: string; kind: 'object' | 'array';
 *            slot: number;                                          // 배열 칸 번호(1 부터). object 면 0
 *            fields: { name: string; value: string | number }[];
 *            dropped: { name: string; value: string | number }[];   // 접히며 사라진 이 줄의 열쇠 칸
 *            resolved: { name: string; value: string | number }[] } // 이번에 풀린 뿌리의 열쇠 칸 (없으면 빈 배열)
 *   done   { docs: number; rows: number; tables: number; links: number; left: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CellValue = string | number;

export type NestedTableData = {
  name: string;
  columns: string[];
  rows: CellValue[][];
};

export type NestedEmbedData = {
  /** 문서 안의 필드 이름 */
  field: string;
  kind: 'object' | 'array';
  /** 접혀 들어올 표 */
  table: string;
  /** 그 표에서 뿌리와 맞추는 열 */
  key: string;
  /** 뿌리 표에서 맞추는 열 */
  ref: string;
};

export type NestedDocumentFacetData = {
  type: 'nested-document';
  stepMs: number;
  tables: NestedTableData[];
  root: { table: string; key: string; value: CellValue };
  embeds: NestedEmbedData[];
};

export type NamedCell = { name: string; value: CellValue };

export function tableIndexOf(tables: readonly NestedTableData[], name: string): number {
  const i = tables.findIndex((tb) => tb.name === name);
  if (i < 0) throw new Error(`nested-document: 표 "${name}" 가 데이터에 없다`);
  return i;
}

export function columnIndexOf(table: NestedTableData, column: string): number {
  const i = table.columns.indexOf(column);
  if (i < 0) throw new Error(`nested-document: 표 "${table.name}" 에 열 "${column}" 가 없다`);
  return i;
}

function cellAt(table: NestedTableData, row: number, col: number): CellValue {
  const r = table.rows[row];
  if (r === undefined) throw new Error(`nested-document: 표 "${table.name}" 에 ${row} 번 줄이 없다`);
  const v = r[col];
  if (v === undefined) {
    throw new Error(`nested-document: 표 "${table.name}" ${row} 번 줄에 ${col} 번 칸이 없다`);
  }
  return v;
}

/**
 * 표마다 "잇는 데만 쓰인 열" — 바탕에서 결정된다. 알고리즘 · 장면이 이 함수 하나를 부른다.
 * 뿌리 표: 뿌리 자신의 열쇠가 아닌 ref 열. 접혀 들어오는 표: key 열.
 */
export function linkColumns(data: NestedDocumentFacetData): string[][] {
  const out: string[][] = data.tables.map(() => []);
  const rootIdx = tableIndexOf(data.tables, data.root.table);
  for (const e of data.embeds) {
    const ti = tableIndexOf(data.tables, e.table);
    const tb = data.tables[ti]!;
    columnIndexOf(tb, e.key);
    columnIndexOf(data.tables[rootIdx]!, e.ref);
    out[ti]!.push(e.key);
    if (e.ref !== data.root.key) out[rootIdx]!.push(e.ref);
  }
  return out;
}

export async function nestedDocument(
  rawCtx: FacetContext<NestedDocumentFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<NestedDocumentFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const tables = data.tables;
  const rootIdx = tableIndexOf(tables, data.root.table);
  const rootTable = tables[rootIdx]!;
  const rootKeyCol = columnIndexOf(rootTable, data.root.key);
  const rootRows: number[] = [];
  rootTable.rows.forEach((_, i) => {
    if (cellAt(rootTable, i, rootKeyCol) === data.root.value) rootRows.push(i);
  });
  if (rootRows.length !== 1) {
    throw new Error(
      `nested-document: 표 "${rootTable.name}" 에서 ${data.root.key} = ${data.root.value} 인 줄이 하나가 아니다 (${rootRows.length})`,
    );
  }
  const rootRow = rootRows[0]!;
  const links = linkColumns(data);
  const rootLinks = links[rootIdx]!;

  const shellFields: NamedCell[] = [];
  const shellLinks: NamedCell[] = [];
  rootTable.columns.forEach((name, c) => {
    const value = cellAt(rootTable, rootRow, c);
    if (rootLinks.includes(name)) shellLinks.push({ name, value });
    else shellFields.push({ name, value });
  });

  // 걸음 0 이 이미 표 셋을 보인다 — 읽을 틈을 두고 첫 걸음으로 간다
  if (!(await pause())) return;
  await ctx.emit({
    type: 'shell',
    payload: { table: rootIdx, row: rootRow, fields: shellFields, links: shellLinks },
  });

  let folded = 1;
  let linkCount = 0;
  const touched = new Set<number>([rootIdx]);

  for (const embed of data.embeds) {
    if (ctx.cancelled) return;
    const ti = tableIndexOf(tables, embed.table);
    const tb = tables[ti]!;
    const keyCol = columnIndexOf(tb, embed.key);
    const refValue = cellAt(rootTable, rootRow, columnIndexOf(rootTable, embed.ref));
    const matches: number[] = [];
    tb.rows.forEach((_, i) => {
      if (cellAt(tb, i, keyCol) === refValue) matches.push(i);
    });
    if (embed.kind === 'object' && matches.length !== 1) {
      throw new Error(
        `nested-document: 객체로 접을 "${embed.field}" 는 줄 하나여야 한다 — ${tb.name}.${embed.key} = ${refValue} 인 줄 ${matches.length}`,
      );
    }
    const resolved: NamedCell[] =
      embed.ref !== data.root.key ? [{ name: embed.ref, value: refValue }] : [];

    let slot = 0;
    for (const row of matches) {
      if (!(await pause())) return;
      slot += 1;
      const fields: NamedCell[] = [];
      const dropped: NamedCell[] = [];
      tb.columns.forEach((name, c) => {
        const value = cellAt(tb, row, c);
        if (c === keyCol) dropped.push({ name, value });
        else fields.push({ name, value });
      });
      await ctx.emit({
        type: 'fold',
        payload: {
          table: ti,
          row,
          field: embed.field,
          kind: embed.kind,
          slot: embed.kind === 'array' ? slot : 0,
          fields,
          dropped,
          resolved: slot === 1 ? resolved : [],
        },
      });
      folded += 1;
      linkCount += 1;
      touched.add(ti);
    }
  }

  let total = 0;
  for (const tb of tables) total += tb.rows.length;

  if (!(await pause())) return;
  await ctx.emit({
    type: 'done',
    payload: { docs: 1, rows: folded, tables: touched.size, links: linkCount, left: total - folded },
  });
}
