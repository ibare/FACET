/**
 * index-costs-write — 같은 표 둘(인덱스 없음 · 인덱스 셋)에 읽기 하나 · 쓰기 하나를 차례로 보낸다.
 *
 * 모형: 비용의 단위는 페이지. 캐시 없음. 표 페이지 = (줄 번호 − 1) ÷ perPage 의 몫 + 1.
 * 읽기에서 인덱스 없음 쪽은 찾는 열이 겹치지 않는다는 약속이 없어 표 페이지를 전부 읽는다.
 * 인덱스 쪽은 그 열의 인덱스 뿌리부터 잎까지(height 장) 내려간 뒤 표 페이지 하나를 읽는다.
 * 쓰기에서 새 줄은 마지막 표 페이지의 빈자리에 들고, 인덱스마다 잎 하나에 항목 하나가 든다
 * (나눔 없음). 쓰기 비용은 쓴 페이지 수다.
 *
 * 이벤트 (발신 차례):
 * - `init` (silent) — 걸음 0 을 갈아 끼운다
 *     { pages: number[] (표 페이지마다 든 줄 수, 페이지 1 부터), perPage: number,
 *       indexes: { name: string; column: string; height: number }[] }
 * - `query` — 질의 하나를 두 표에 보인다  { kind: 'select' | 'insert' }
 * - `scan` — 인덱스 없음 쪽이 표 페이지를 차례로 읽는다
 *     { pages: number[] (읽은 표 페이지 번호, 읽은 차례), reads: number, row: number, page: number, slot: number }
 * - `seek` — 인덱스 쪽이 인덱스 하나를 따라 좁혀 들어간다
 *     { index: string, levels: number (읽은 인덱스 페이지 수), reads: number, row: number, page: number, slot: number }
 * - `write` — 인덱스 없음 쪽 쓰기  { row: number, page: number, slot: number, writes: number }
 * - `fan` — 인덱스 쪽 쓰기가 표 페이지와 잎마다 갈라진다
 *     { row: number, page: number, slot: number, leaves: string[] (인덱스 이름), writes: number }
 *
 * `slot` 은 페이지 안 자리 (1 부터). `row` 는 줄 번호 (1 부터, 넣은 차례).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IndexSpec = { name: string; column: string; height: number };

export type IndexCostsWriteFacetData = {
  type: 'index-costs-write';
  stepMs: number;
  table: { name: string; columns: string[]; rows: number; perPage: number };
  indexes: IndexSpec[];
  select: { sql: string; column: string; value: string; row: number };
  insert: { sql: string; values: (number | string)[] };
};

function isPositiveInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/** 줄 번호 → 표 페이지 번호 (1 부터). */
function pageOfRow(row: number, perPage: number): number {
  return Math.floor((row - 1) / perPage) + 1;
}

/** 줄 번호 → 페이지 안 자리 (1 부터). */
function slotOfRow(row: number, perPage: number): number {
  return ((row - 1) % perPage) + 1;
}

export async function indexCostsWrite(
  context: FacetContext<IndexCostsWriteFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<IndexCostsWriteFacetData>;
  const data = ctx.data;
  const { table, indexes, select, insert } = data;
  const stepMs = data.stepMs;

  if (!isPositiveInt(table.rows) || !isPositiveInt(table.perPage)) {
    throw new Error(`index-costs-write: 줄 수 · 페이지당 줄 수가 양의 정수가 아니다 (${table.rows}, ${table.perPage})`);
  }
  for (const ix of indexes) {
    if (!table.columns.includes(ix.column)) {
      throw new Error(`index-costs-write: 인덱스 ${ix.name} 의 열 ${ix.column} 이 표에 없다`);
    }
    // 화면 · 캡션은 뿌리 → 잎 두 층만 말한다. 가운데 층이 있는 트리는 이 조각의 모형 밖이다.
    if (ix.height !== 2) {
      throw new Error(`index-costs-write: 인덱스 ${ix.name} 의 높이가 2 가 아니다 (${ix.height})`);
    }
  }
  if (!table.columns.includes(select.column)) {
    throw new Error(`index-costs-write: 찾는 열 ${select.column} 이 표에 없다`);
  }
  if (!select.sql.includes(`${select.column} = '${select.value}'`)) {
    throw new Error(`index-costs-write: 질의 글자와 찾는 조건이 어긋난다 (${select.sql})`);
  }
  if (!isPositiveInt(select.row) || select.row > table.rows) {
    throw new Error(`index-costs-write: 찾는 줄 번호가 표 밖이다 (${select.row})`);
  }
  if (insert.values.length !== table.columns.length) {
    throw new Error(`index-costs-write: 넣는 값 수가 열 수와 다르다 (${insert.values.length} ≠ ${table.columns.length})`);
  }
  const seekIndex = indexes.find((ix) => ix.column === select.column);
  if (seekIndex === undefined) {
    throw new Error(`index-costs-write: ${select.column} 열의 인덱스가 없다 — 이 조각의 인덱스 쪽은 좁혀 들어갈 길이 있어야 한다`);
  }

  // 표 페이지마다 든 줄 수.
  const pageCount = pageOfRow(table.rows, table.perPage);
  const pages: number[] = [];
  for (let p = 1; p <= pageCount; p += 1) {
    const first = (p - 1) * table.perPage + 1;
    const last = Math.min(p * table.perPage, table.rows);
    pages.push(last - first + 1);
  }

  // 새 줄의 자리 — 마지막 페이지의 빈자리여야 한다. 새 페이지를 여는 것은 이 조각의 모형 밖이다.
  const newRow = table.rows + 1;
  const newPage = pageOfRow(newRow, table.perPage);
  if (newPage > pageCount) {
    throw new Error(`index-costs-write: 새 줄 r${newRow} 이 새 페이지 ${newPage} 를 연다 — 마지막 페이지에 빈자리가 없다`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      pages,
      perPage: table.perPage,
      indexes: indexes.map((ix) => ({ name: ix.name, column: ix.column, height: ix.height })),
    },
  });
  // 걸음 0 은 두 표가 이미 서 있는 화면이다 — 읽을 틈을 준다.
  if (!(await pause())) return;

  await ctx.emit({ type: 'query', payload: { kind: 'select' } });
  if (!(await pause())) return;

  // 인덱스 없음: 표 페이지를 처음부터 끝까지 읽는다.
  const scanned: number[] = [];
  for (let p = 1; p <= pageCount; p += 1) {
    if (ctx.cancelled) return;
    scanned.push(p);
  }
  const hitPage = pageOfRow(select.row, table.perPage);
  const hitSlot = slotOfRow(select.row, table.perPage);
  await ctx.emit({
    type: 'scan',
    payload: { pages: scanned, reads: scanned.length, row: select.row, page: hitPage, slot: hitSlot },
  });
  if (!(await pause())) return;

  // 인덱스 쪽: 뿌리 → … → 잎 (height 장) 뒤에 표 페이지 하나.
  await ctx.emit({
    type: 'seek',
    payload: {
      index: seekIndex.name,
      levels: seekIndex.height,
      reads: seekIndex.height + 1,
      row: select.row,
      page: hitPage,
      slot: hitSlot,
    },
  });
  if (!(await pause())) return;

  await ctx.emit({ type: 'query', payload: { kind: 'insert' } });
  if (!(await pause())) return;

  const newSlot = slotOfRow(newRow, table.perPage);
  await ctx.emit({
    type: 'write',
    payload: { row: newRow, page: newPage, slot: newSlot, writes: 1 },
  });
  if (!(await pause())) return;

  const leaves = indexes.map((ix) => ix.name);
  await ctx.emit({
    type: 'fan',
    payload: { row: newRow, page: newPage, slot: newSlot, leaves, writes: 1 + leaves.length },
  });
  await pause();
}
