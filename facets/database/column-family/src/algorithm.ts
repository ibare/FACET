/**
 * 컬럼 패밀리 — 칸을 어떤 묶음으로 담느냐가 한 질의가 읽는 쪽 수를 정한다.
 *
 * 1차 데이터는 구조다: 표의 줄(열쇠와 칸 값) · 칸 차례 · 쪽 하나의 칸 수 · 담는 법 셋(묶음 이름과
 * 칸마다의 묶음 번호) · 묻는 칸 사다리와 그 질의. 쪽 배치 · 읽은 쪽 · 딸려 온 칸 · 쓴 칸 · 담는 법마다의
 * 읽은 쪽 · 가장 적은 쪽은 여기서 셈한다.
 *
 * 규약 (column-oriented 조각과 같다)
 * - 묶음마다 따로 쪽을 연다 — 두 묶음이 한 쪽을 나눠 쓰지 않는다.
 * - 묶음 안은 줄 차례(u1 부터), 줄 안은 칸 차례로 이어 적고 `cellsPerPage` 칸마다 쪽을 끊는다.
 * - 읽기의 단위는 쪽 — 묻는 칸이 하나라도 든 묶음은 그 쪽을 전부 읽는다. 캐시 · 압축 없음.
 * - 딸려 온 칸 = 읽은 쪽들의 찬 칸 수. 쓴 칸 = 줄 × 묻는 칸. 줄 열쇠는 칸으로 세지 않는다.
 * - 동률 — 담는 법마다의 읽은 쪽에서 가장 적은 것을 고를 때 값이 같으면 사다리에 먼저 적힌 담는 법.
 *   이 데이터에서는 가장 적은 자리에 동률이 걸리지 않는다 (묻는 칸 3 의 둘씩 · 칸마다 6 은 가장 적은 값이 아니다).
 *
 * 한 판 = 걸음 넷 (걸음 0 포함, 손잡이와 무관)
 *   0 `round`  처음 — 표와 질의
 *   1 `store`  칸이 묶음마다의 쪽으로 옮겨 간다          phase `store-family`
 *   2 `lift`   질의가 묻는 칸이 든 묶음의 쪽을 들어 올린다  phase `lift-pages`   (계기 셋)
 *   3 `count`  딸려 온 칸 대 쓴 칸, 담는 법 셋의 읽은 쪽    phase `count-cells`
 * 걸음 3 뒤 입력을 기다리고, 받은 값으로 한 판을 처음부터 다시 재생한다.
 *
 * 이벤트 (payload 스키마)
 *   phase  { phase: 'store-family' | 'lift-pages' | 'count-cells' }                    silent
 *   round  { round: number, grouping: number, sql: string, table: string,
 *            rowCount: number, columnCount: number, askedCount: number }
 *   store  { grouping: number, pageCount: number,
 *            families: { name: string, pageCount: number,
 *                        pages: { cells: { row: string, column: string, value: string }[] }[] }[] }
 *   lift   { lifted: string[], pagesRead: number,
 *            cells: { row: string, column: string, state: 'used' | 'fetched' | 'unread' }[] }
 *   count  { cellsFetched: number, cellsUsed: number, fewest: number, scale: number,
 *            bars: { grouping: number, pages: number }[] }
 *   (round · store · lift · count 는 silent 가 아니다 — 저마다 걸음 하나)
 *
 * 계기 — `pages-read` · `cells-fetched` · `cells-used` (걸음 2 에 싣는다. 판이 시작할 때 0 으로 되돌린다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ColumnFamilyRow = { key: string; values: (string | number)[] };
export type ColumnFamilyGrouping = { id: string; families: string[]; familyOf: number[] };
export type ColumnFamilyQuery = { sql: string; asked: string[] };

export type ColumnFamilyData = {
  type: 'column-family';
  stepMs: number;
  table: string;
  columns: string[];
  rows: ColumnFamilyRow[];
  cellsPerPage: number;
  /** 담는 법 — 손잡이 `grouping` 의 값이 이 배열의 자리다 */
  groupings: ColumnFamilyGrouping[];
  /** 손잡이 `grouping` 의 사다리 */
  groupingLadder: number[];
  /** 손잡이 `columns` 의 사다리 (묻는 칸 수) */
  columnsLadder: number[];
  /** 묻는 칸 수마다의 질의 — `columnsLadder` 와 같은 차례 */
  queries: ColumnFamilyQuery[];
  startGrouping: number;
  startColumns: number;
};

export type PlacedCell = { row: string; column: string; value: string };
export type FamilyLayout = { name: string; pages: PlacedCell[][] };
export type CellState = 'used' | 'fetched' | 'unread';

/** 담는 법 하나의 쪽 배치 — 묶음마다 따로 쪽을 열고 칸 여덟마다 끊는다. */
export function layoutFamilies(data: ColumnFamilyData, grouping: number): FamilyLayout[] {
  const g = data.groupings[grouping];
  if (!g) throw new Error(`column-family: 담는 법 ${grouping} 이 데이터에 없다`);
  if (g.familyOf.length !== data.columns.length) {
    throw new Error(`column-family: 담는 법 ${g.id} 의 묶음 번호 수가 칸 수와 다르다`);
  }
  if (!(data.cellsPerPage > 0)) throw new Error('column-family: 쪽 하나의 칸 수가 양수가 아니다');
  return g.families.map((name, f) => {
    const cols: number[] = [];
    for (let c = 0; c < g.familyOf.length; c += 1) if (g.familyOf[c] === f) cols.push(c);
    if (cols.length === 0) throw new Error(`column-family: 묶음 ${name} 에 칸이 없다`);
    const cells: PlacedCell[] = [];
    for (const row of data.rows) {
      if (row.values.length !== data.columns.length) {
        throw new Error(`column-family: 줄 ${row.key} 의 칸 수가 표의 칸 수와 다르다`);
      }
      for (const c of cols) {
        const column = data.columns[c];
        const value = row.values[c];
        if (column === undefined || value === undefined) throw new Error(`column-family: 줄 ${row.key} 의 칸 ${c} 가 없다`);
        cells.push({ row: row.key, column, value: String(value) });
      }
    }
    const pages: PlacedCell[][] = [];
    for (let j = 0; j < cells.length; j += data.cellsPerPage) pages.push(cells.slice(j, j + data.cellsPerPage));
    return { name, pages };
  });
}

function queryFor(data: ColumnFamilyData, columns: number): ColumnFamilyQuery {
  const at = data.columnsLadder.indexOf(columns);
  const q = at >= 0 ? data.queries[at] : undefined;
  if (!q) throw new Error(`column-family: 묻는 칸 ${columns} 의 질의가 데이터에 없다`);
  if (q.asked.length !== columns) throw new Error(`column-family: 질의 "${q.sql}" 의 묻는 칸 수가 ${columns} 가 아니다`);
  for (const name of q.asked) {
    if (!data.columns.includes(name)) throw new Error(`column-family: 묻는 칸 ${name} 이 표에 없다`);
  }
  return q;
}

export type ColumnFamilyReading = {
  lifted: string[];
  pagesRead: number;
  cellsFetched: number;
  cellsUsed: number;
  cells: { row: string; column: string; state: CellState }[];
};

/** 질의 하나가 한 담는 법에서 읽는 것 — 묻는 칸이 든 묶음은 쪽을 전부 든다. */
export function readWith(data: ColumnFamilyData, grouping: number, columns: number): ColumnFamilyReading {
  const q = queryFor(data, columns);
  const layout = layoutFamilies(data, grouping);
  const lifted: string[] = [];
  let pagesRead = 0;
  let cellsFetched = 0;
  const cells: ColumnFamilyReading['cells'] = [];
  for (const fam of layout) {
    const hit = fam.pages.some((page) => page.some((cell) => q.asked.includes(cell.column)));
    if (hit) {
      lifted.push(fam.name);
      pagesRead += fam.pages.length;
    }
    for (const page of fam.pages) {
      for (const cell of page) {
        if (hit) cellsFetched += 1;
        const state: CellState = !hit ? 'unread' : q.asked.includes(cell.column) ? 'used' : 'fetched';
        cells.push({ row: cell.row, column: cell.column, state });
      }
    }
  }
  return { lifted, pagesRead, cellsFetched, cellsUsed: data.rows.length * q.asked.length, cells };
}

/**
 * 담는 법 셋의 읽은 쪽과, 그 가운데 가장 적은 자리 (동률이면 사다리에 먼저 적힌 것).
 * scale = 모든 손잡이 조합의 읽은 쪽 가운데 가장 큰 값 — 막대 눈금의 끝이라 판마다 같다.
 */
export function compareLayouts(
  data: ColumnFamilyData,
  columns: number,
): { bars: { grouping: number; pages: number }[]; fewest: number; scale: number } {
  const bars = data.groupingLadder.map((grouping) => ({ grouping, pages: readWith(data, grouping, columns).pagesRead }));
  let fewest = -1;
  let best = Infinity;
  for (const bar of bars) {
    if (bar.pages < best) {
      best = bar.pages;
      fewest = bar.grouping;
    }
  }
  if (fewest < 0) throw new Error('column-family: 견줄 담는 법이 없다');
  let scale = 0;
  for (const k of data.columnsLadder) {
    for (const grouping of data.groupingLadder) scale = Math.max(scale, readWith(data, grouping, k).pagesRead);
  }
  return { bars, fewest, scale };
}

type Knobs = { grouping: number; columns: number };

/** 입력 하나를 손잡이 값으로 — 우리 것이 아니거나 사다리 밖이면 null. */
function readKnob(data: ColumnFamilyData, input: { type: string; payload?: unknown }, now: Knobs): Knobs | null {
  if (input.type !== 'grouping' && input.type !== 'columns') return null;
  const p = input.payload;
  if (typeof p !== 'object' || p === null) return null;
  const value = (p as { value?: unknown }).value;
  if (typeof value !== 'number') return null;
  if (input.type === 'grouping') {
    if (!data.groupingLadder.includes(value)) return null;
    return { grouping: value, columns: now.columns };
  }
  if (!data.columnsLadder.includes(value)) return null;
  return { grouping: now.grouping, columns: value };
}

export async function columnFamilyAlgorithm(baseCtx: FacetContext<ColumnFamilyData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<ColumnFamilyData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = new Map<string, number>();
  const show = (name: string, value: number) => {
    const before = shown.get(name);
    if (before === undefined || before !== value) ctx.metric(name, value - (before ?? 0));
    shown.set(name, value);
  };

  let knobs: Knobs = { grouping: data.startGrouping, columns: data.startColumns };
  let round = 0;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      round += 1;
      const q = queryFor(data, knobs.columns);

      // 걸음 0 — 처음: 표와 질의
      show('pages-read', 0);
      show('cells-fetched', 0);
      show('cells-used', 0);
      await ctx.emit({
        type: 'round',
        payload: {
          round,
          grouping: knobs.grouping,
          sql: q.sql,
          table: data.table,
          rowCount: data.rows.length,
          columnCount: data.columns.length,
          askedCount: q.asked.length,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 1 — 담기
      const layout = layoutFamilies(data, knobs.grouping);
      await phase('store-family');
      await ctx.emit({
        type: 'store',
        payload: {
          grouping: knobs.grouping,
          pageCount: layout.reduce((sum, fam) => sum + fam.pages.length, 0),
          families: layout.map((fam) => ({
            name: fam.name,
            pageCount: fam.pages.length,
            pages: fam.pages.map((cells) => ({ cells })),
          })),
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 2 — 질의가 쪽을 들어 올린다
      const reading = readWith(data, knobs.grouping, knobs.columns);
      await phase('lift-pages');
      show('pages-read', reading.pagesRead);
      show('cells-fetched', reading.cellsFetched);
      show('cells-used', reading.cellsUsed);
      await ctx.emit({
        type: 'lift',
        payload: { lifted: reading.lifted, pagesRead: reading.pagesRead, cells: reading.cells },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 3 — 셈
      const { bars, fewest, scale } = compareLayouts(data, knobs.columns);
      await phase('count-cells');
      await ctx.emit({
        type: 'count',
        payload: { cellsFetched: reading.cellsFetched, cellsUsed: reading.cellsUsed, fewest, scale, bars },
      });

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const next = readKnob(data, input, knobs);
        if (next === null) continue;
        knobs = next;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
