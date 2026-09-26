/**
 * 복합 인덱스 — 열 차례가 어느 질의가 싼지를 정한다.
 *
 * 표 `movies` 의 줄마다 인덱스 항목 하나를 두고, 항목을 **열 차례의 사전순**으로 늘어세운 뒤
 * 질의 하나를 푼다. 앞 열이 조건에 있으면 조건에 든 앞에서부터 이어진 열들(접두)로 첫 맞는 항목을
 * 곧장 짚고(짚는 비용은 세지 않는다), 거기서 차례로 보며 접두가 맞지 않는 항목을 처음 만나면
 * **그 항목까지 세고** 멈춘다. 끝에 닿으면 거기서 멈춘다. 앞 열이 조건에 없으면 항목 전부를 본다.
 * 맞음 = 조건 전부가 맞는 항목 — 훑은 항목과 따로 센다.
 *
 * 견줌 — 정수는 크기, 문자열은 UTF-8 바이트 사전순.
 * 동률 규칙 — 정렬 열쇠가 모두 같으면 **먼저 넣은 줄**이 앞 (이 자료에는 (genre, year) 짝이 모두 달라 걸리지 않는다).
 *
 * 손잡이 둘 — `columnOrder` (열 차례 사다리의 색인) · `query` (질의 사다리의 색인).
 * 한 판 = 걸음 다섯 (걸음 0 포함). 한 판을 끝까지 재생한 뒤 입력을 기다리고, 받은 값으로 다시 재생한다.
 *
 * ── 이벤트 (silent 가 아닌 것은 모두 걸음 경계 앞에서 보낸다)
 *   round  { orderIndex: number; queryIndex: number; order: string[]; indexName: string; sql: string;
 *            table: string; columns: string[]; rows: { row: number; cells: (string | number)[] }[];
 *            targets: number[] }
 *          걸음 0. rows 는 표 차례(r1 부터), cells 는 columns 차례. targets = WHERE 를 채우는 줄 번호
 *   sort   { order: string[]; entries: { pos: number; row: number; values: (string | number)[] }[] }
 *          걸음 1. pos 는 1 부터, values 는 열 차례대로
 *   seek   { mode: 'seek' | 'scan-all'; pos: number }            걸음 2. 짚은 자리 (처음부터면 1)
 *   scan   { from: number; to: number; scanned: number; stoppedAt: number | null }
 *          걸음 3. stoppedAt = 접두가 맞지 않아 멈춘 항목의 자리 (끝에 닿았으면 null)
 *   fetch  { matches: { pos: number; row: number }[]; count: number }   걸음 4
 *   phase  { phase: string }  — silent
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   sort-entries · seek-first · scan-prefix · scan-all
 *
 * ── 계기
 *   entries-scanned — 훑은 항목 (걸음 3)
 *   rows-matched    — 맞은 줄 (걸음 4)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CellValue = string | number;

export type CompositeIndexData = {
  type: 'composite-index';
  stepMs: number;
  /** 표 이름 (자료) */
  table: string;
  /** 표의 열 이름 (자료) */
  columns: string[];
  /** 표의 줄 — 넣은 차례. 줄 번호는 1 부터 이 차례로 붙는다 */
  rows: Record<string, CellValue>[];
  /** 손잡이 `columnOrder` 의 사다리 — 인덱스의 열 차례 */
  columnOrders: string[][];
  /** 열 차례마다의 인덱스 이름 (자료) */
  indexNames: string[];
  /** 손잡이 `query` 의 사다리 — WHERE 의 열 = 값 */
  queries: Record<string, CellValue>[];
  /** 질의마다의 SQL 문장 (자료, 그대로 띄운다) */
  querySql: string[];
};

export type IndexEntry = { pos: number; row: number; values: CellValue[] };

export type CompositeScan = {
  order: string[];
  entries: IndexEntry[];
  /** 조건에 든 앞에서부터 이어진 열 수 */
  prefixLength: number;
  mode: 'seek' | 'scan-all';
  /** 짚은 자리 (1 부터). 처음부터면 1 */
  startPos: number;
  scanned: number;
  from: number;
  to: number;
  stoppedAt: number | null;
  matches: { pos: number; row: number }[];
  targets: number[];
};

const encoder = new TextEncoder();

/** 문자열은 UTF-8 바이트 사전순, 정수는 크기. 종류가 다르면 던진다. */
export function compareValues(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = encoder.encode(a);
    const y = encoder.encode(b);
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) {
      if (x[i] !== y[i]) return x[i]! - y[i]!;
    }
    return x.length - y.length;
  }
  throw new Error(`composite-index: 종류가 다른 값은 견줄 수 없다 (${String(a)} · ${String(b)})`);
}

function cellOf(data: CompositeIndexData, rowIndex: number, column: string): CellValue {
  const row = data.rows[rowIndex];
  if (row === undefined) throw new Error(`composite-index: 줄 r${rowIndex + 1} 이 없다`);
  if (!Object.prototype.hasOwnProperty.call(row, column)) {
    throw new Error(`composite-index: 줄 r${rowIndex + 1} 에 열 ${column} 이 없다`);
  }
  const v = row[column];
  if (typeof v !== 'string' && typeof v !== 'number') {
    throw new Error(`composite-index: 줄 r${rowIndex + 1} 의 열 ${column} 값이 비었다`);
  }
  return v;
}

function orderAt(data: CompositeIndexData, orderIndex: number): string[] {
  const order = data.columnOrders[orderIndex];
  if (order === undefined) throw new Error(`composite-index: 열 차례 ${orderIndex} 가 사다리에 없다`);
  for (const c of order) {
    if (!data.columns.includes(c)) throw new Error(`composite-index: 열 ${c} 이 표에 없다`);
  }
  return order;
}

function queryAt(data: CompositeIndexData, queryIndex: number): Record<string, CellValue> {
  const q = data.queries[queryIndex];
  if (q === undefined) throw new Error(`composite-index: 질의 ${queryIndex} 가 사다리에 없다`);
  for (const c of Object.keys(q)) {
    if (!data.columns.includes(c)) throw new Error(`composite-index: 질의의 열 ${c} 이 표에 없다`);
  }
  return q;
}

/** 인덱스 항목을 열 차례의 사전순으로 늘어세운다. 동률이면 먼저 넣은 줄이 앞. */
export function sortEntries(data: CompositeIndexData, order: string[]): IndexEntry[] {
  const items = data.rows.map((_, i) => ({
    row: i + 1,
    values: order.map((c) => cellOf(data, i, c)),
  }));
  items.sort((a, b) => {
    for (let k = 0; k < order.length; k++) {
      const d = compareValues(a.values[k]!, b.values[k]!);
      if (d !== 0) return d;
    }
    return a.row - b.row;
  });
  return items.map((e, i) => ({ pos: i + 1, row: e.row, values: e.values }));
}

/** 한 판의 셈 — 정렬 · 짚기 · 훑기 · 맞음. 화면에 뜨는 수는 전부 여기서 나온다. */
export function compositeScan(data: CompositeIndexData, orderIndex: number, queryIndex: number): CompositeScan {
  const order = orderAt(data, orderIndex);
  const query = queryAt(data, queryIndex);
  const entries = sortEntries(data, order);

  // 접두 — 조건에 든 앞에서부터 이어진 열들
  let prefixLength = 0;
  while (prefixLength < order.length && Object.prototype.hasOwnProperty.call(query, order[prefixLength]!)) {
    prefixLength++;
  }
  const prefixMatches = (e: IndexEntry): boolean => {
    for (let k = 0; k < prefixLength; k++) {
      if (compareValues(e.values[k]!, query[order[k]!]!) !== 0) return false;
    }
    return true;
  };
  const fullMatches = (e: IndexEntry): boolean => {
    for (const [c, v] of Object.entries(query)) {
      const k = order.indexOf(c);
      if (k < 0) throw new Error(`composite-index: 열 ${c} 이 인덱스에 없다`);
      if (compareValues(e.values[k]!, v) !== 0) return false;
    }
    return true;
  };

  const n = entries.length;
  let mode: 'seek' | 'scan-all';
  let start: number;
  let scanned = 0;
  let stoppedAt: number | null = null;
  if (prefixLength === 0) {
    mode = 'scan-all';
    start = 0;
    scanned = n;
  } else {
    mode = 'seek';
    start = entries.findIndex(prefixMatches);
    if (start < 0) throw new Error('composite-index: 접두에 맞는 항목이 없다 — 이 자료로는 짚을 자리를 셈할 수 없다');
    let i = start;
    while (i < n) {
      scanned++;
      if (!prefixMatches(entries[i]!)) {
        stoppedAt = i + 1;
        break;
      }
      i++;
    }
  }
  const from = start + 1;
  const to = start + scanned;
  const matches = entries
    .slice(start, start + scanned)
    .filter(fullMatches)
    .map((e) => ({ pos: e.pos, row: e.row }));
  const targets = data.rows
    .map((_, i) => i)
    .filter((i) => Object.entries(query).every(([c, v]) => compareValues(cellOf(data, i, c), v) === 0))
    .map((i) => i + 1);

  return { order, entries, prefixLength, mode, startPos: from, scanned, from, to, stoppedAt, matches, targets };
}

function inLadder(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

export async function compositeIndexAlgorithm(baseCtx: FacetContext<CompositeIndexData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<CompositeIndexData>;
  const data = ctx.data;
  if (data.columnOrders.length !== data.indexNames.length) {
    throw new Error('composite-index: 열 차례와 인덱스 이름의 수가 다르다');
  }
  if (data.queries.length !== data.querySql.length) {
    throw new Error('composite-index: 질의와 SQL 문장의 수가 다르다');
  }
  const stepMs = data.stepMs;

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };

  let orderIndex = 0;
  let queryIndex = 0;

  const playRound = async (): Promise<boolean> => {
    const r = compositeScan(data, orderIndex, queryIndex);
    const indexName = data.indexNames[orderIndex];
    const sql = data.querySql[queryIndex];
    if (indexName === undefined || sql === undefined) throw new Error('composite-index: 사다리 밖의 손잡이 값');

    // 걸음 0 — 처음 모습
    setMetric('entries-scanned', 0);
    setMetric('rows-matched', 0);
    await ctx.emit({
      type: 'round',
      payload: {
        orderIndex,
        queryIndex,
        order: r.order,
        indexName,
        sql,
        table: data.table,
        columns: data.columns,
        rows: data.rows.map((_, i) => ({ row: i + 1, cells: data.columns.map((c) => cellOf(data, i, c)) })),
        targets: r.targets,
      },
    });
    if (!(await ctx.sleep(stepMs))) return false;

    // 걸음 1 — 항목이 열 차례로 늘어선다
    await phase('sort-entries');
    await ctx.emit({ type: 'sort', payload: { order: r.order, entries: r.entries } });
    if (!(await ctx.sleep(stepMs))) return false;

    // 걸음 2 — 짚기 또는 처음부터
    if (r.mode === 'seek') await phase('seek-first');
    else await phase('scan-all');
    await ctx.emit({ type: 'seek', payload: { mode: r.mode, pos: r.startPos } });
    if (!(await ctx.sleep(stepMs))) return false;

    // 걸음 3 — 훑기
    if (r.mode === 'seek') await phase('scan-prefix');
    else await phase('scan-all');
    await ctx.emit({
      type: 'scan',
      payload: { from: r.from, to: r.to, scanned: r.scanned, stoppedAt: r.stoppedAt },
    });
    setMetric('entries-scanned', r.scanned);
    if (!(await ctx.sleep(stepMs))) return false;

    // 걸음 4 — 맞은 항목에서 표의 줄로 (새 phase 없음 — 앞 줄이 켜진 채)
    await ctx.emit({ type: 'fetch', payload: { matches: r.matches, count: r.matches.length } });
    setMetric('rows-matched', r.matches.length);
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 입력 대기 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (input.type === 'columnOrder' && inLadder(value, data.columnOrders.length)) {
          orderIndex = value;
          break;
        }
        if (input.type === 'query' && inLadder(value, data.queries.length)) {
          queryIndex = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
