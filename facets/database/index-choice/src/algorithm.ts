/**
 * index-choice — 인덱스와 질의 꼴.
 *
 * 같은 질의를 세 길(표 훑기 · B+ 트리 · 해시)에 동시에 걸어 길마다 **실제로 읽을 페이지 수**를 세고,
 * 가장 적게 읽는 길을 골라 그 페이지를 읽는다. 끝으로 INSERT 한 번이 걸린 곳마다 쓰는 페이지를 센다.
 *
 * ── 세는 법 (조각 leaves-linked · all-data-in-leaves · exact-match-only · index-costs-write 와 같다)
 *   - 페이지 하나를 읽으면 1, 쓰면 1. 캐시가 없다 — 맞은 줄마다 표 페이지 하나를 다시 센다.
 *   - 표 훑기 = 표 페이지 전부.
 *   - B+ 길 = 뿌리에서 lo 로 내려가고(가름 열쇠 `k ≥ s → 오른쪽`), 잎 사슬을 옆으로 건너가며,
 *     hi 를 넘는 열쇠를 처음 만난 잎에서 멈춘다 (그 잎도 읽은 페이지). 값 = 안쪽 페이지 + 읽은 잎 + 맞은 줄.
 *   - 해시 길 = h(k) = k mod 버킷 수. `=` 는 버킷 하나, 범위는 버킷 전부. 값 = 연 버킷 + 맞은 줄.
 *     버킷 안 차례 = 표에 넣은 차례.
 *   - INSERT 는 쓴 페이지만 센다 (표 1 + 걸린 인덱스마다 1). 자리를 찾느라 읽는 페이지는 세지 않는다. 잎 나눔 없음.
 *
 * ── 동률 규칙
 *   길의 값이 같으면 먼저 적힌 길이 이긴다 — 표 훑기 → B+ → 해시. 이 데이터의 열여섯 조합에서는 동률이 걸리지 않는다
 *   (test 가 센다).
 *
 * ── 손잡이 (reactive)
 *   `indexSet` — 걸린 인덱스 (`initialData.indexSets` 의 번호). `query` — 질의 (`initialData.queries` 의 번호).
 *   한 판을 끝까지 재생하고 입력을 기다린다. 받은 값으로 처음부터 다시 재생한다.
 *
 * ── 걸음 (걸음 0 포함, 걸리지 않은 길의 걸음은 건너뛴다)
 *   0 처음 (round-start) · 1 표 훑기 값 · [2 B+ 값] · [3 해시 값] · 4 고른 길 읽기 · 5 INSERT 쓰기
 *
 * ── 이벤트
 *   structure   (non-silent, 첫 판의 걸음 0 에 한 번)
 *     { tableName, tablePages: { id, rows: { row, key }[] }[], rowsPerPage,
 *       btreeName, root, leafCapacity, treePages: { id, kind: 'inner'|'leaf', keys: number[], children: string[], next: string|null }[],
 *       hashName, bucketCount, buckets: { id, keys: number[] }[] }
 *   round-start (non-silent) { sql, insertSql, hasBtree: boolean, hasHash: boolean }
 *   cost        (non-silent) { path: 'seq'|'btree'|'hash', pages, indexPages: string[], descent: string[],
 *                              leaves: string[], tablePages: string[], rows: string[],
 *                              inner (안쪽 페이지 수), leafCount (읽은 잎 · 연 버킷 수), rowCount (맞은 줄 = 표 페이지 수) }
 *   pick        (non-silent) { path, pages, read: string[] (읽는 차례), rows: string[] }
 *   insert      (non-silent) { sql, row, key, pages (쓴 페이지 수), writes: { page, kind: 'table'|'leaf'|'bucket', at, entries: { key, row }[] }[] }
 *                              — entries 는 쓴 뒤 그 페이지의 항목 전부 (row 는 표 페이지에서만 문자열, 나머지는 빈 글자)
 *   phase       (silent) { phase }
 *
 * ── phase 어휘 (irs.ts 와 정확히 같다)
 *   cost-seq · cost-btree · cost-hash · pick-cheapest · insert-write
 *
 * ── 계기
 *   pages-read    — 고른 길이 읽은 페이지 (걸음 4)
 *   pages-written — INSERT 가 쓴 페이지 (걸음 5)
 *   판마다 0 에서 시작, 지금 보이는 값과의 차이만 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IndexChoicePage = {
  id: string;
  kind: 'inner' | 'leaf';
  keys: number[];
  /** 안쪽 페이지의 가지. 잎이면 빈 배열 */
  children: string[];
  /** 잎 사슬의 다음 잎. 안쪽이거나 끝 잎이면 null */
  next: string | null;
};

export type IndexChoiceData = {
  type: 'index-choice';
  stepMs: number;
  /** 한 걸음 안의 운동 길이 — 걸음 = 운동 + stepMs */
  motionMs: number;
  table: { name: string; prices: number[]; rowsPerPage: number };
  btree: { name: string; root: string; leafCapacity: number; pages: IndexChoicePage[] };
  hash: { name: string; bucketCount: number };
  /** 손잡이 `indexSet` 의 사다리 — 0/1 */
  indexSets: { btree: number; hash: number }[];
  /** 손잡이 `query` 의 사다리 — 양 끝 포함 */
  queries: { lo: number; hi: number; sql: string }[];
  insert: { id: number; price: number; sql: string };
};

export type IndexChoicePath = 'seq' | 'btree' | 'hash';

export type IndexChoiceCost = {
  path: IndexChoicePath;
  pages: number;
  /** 읽는 인덱스 페이지 — 읽는 차례 */
  indexPages: string[];
  /** 내려가기 (뿌리 → 첫 잎). B+ 가 아니면 빈 배열 */
  descent: string[];
  /** 읽은 잎 (B+) 또는 연 버킷 (해시) */
  leaves: string[];
  /** 맞은 줄마다 읽는 표 페이지 — 읽는 차례 */
  tablePages: string[];
  /** 맞은 줄 자리 */
  rows: string[];
};

export type IndexChoiceWrite = {
  page: string;
  kind: 'table' | 'leaf' | 'bucket';
  at: number;
  entries: { key: number; row: string }[];
};

export const INDEX_CHOICE_DEFAULT_SET = 3;
export const INDEX_CHOICE_DEFAULT_QUERY = 1;

// ─────────────────────────────────────────────────────────────── 구조 셈

function rowId(rowNo: number): string {
  return `r${rowNo}`;
}

export function tablePageOf(data: IndexChoiceData, rowNo: number): string {
  if (!Number.isInteger(rowNo) || rowNo < 1) throw new Error(`줄 번호가 아니다: ${rowNo}`);
  return `T${Math.floor((rowNo - 1) / data.table.rowsPerPage) + 1}`;
}

export function tablePageCount(data: IndexChoiceData): number {
  const n = data.table.prices.length;
  const per = data.table.rowsPerPage;
  if (per < 1) throw new Error(`페이지당 줄 수가 잘못됐다: ${per}`);
  return Math.floor((n + per - 1) / per);
}

/** price 로 줄 번호(1 부터)를 찾는다. 없으면 던진다. */
export function rowOfKey(data: IndexChoiceData, key: number): number {
  const i = data.table.prices.indexOf(key);
  if (i < 0) throw new Error(`표에 없는 열쇠: ${key}`);
  return i + 1;
}

function pageById(data: IndexChoiceData, id: string): IndexChoicePage {
  const p = data.btree.pages.find((x) => x.id === id);
  if (!p) throw new Error(`트리에 없는 페이지: ${id}`);
  return p;
}

/** 뿌리에서 key 로 내려가 닿는 잎까지의 페이지들 (안쪽 … 잎). */
export function descend(data: IndexChoiceData, key: number): string[] {
  const out: string[] = [];
  let node = pageById(data, data.btree.root);
  while (node.kind === 'inner') {
    out.push(node.id);
    let i = 0;
    while (i < node.keys.length && key >= (node.keys[i] as number)) i += 1;
    const child = node.children[i];
    if (child === undefined) throw new Error(`안쪽 페이지 ${node.id} 에 가지 ${i} 가 없다`);
    node = pageById(data, child);
  }
  out.push(node.id);
  return out;
}

export function btreeCost(data: IndexChoiceData, lo: number, hi: number): IndexChoiceCost {
  const path = descend(data, lo);
  const inner = path.slice(0, -1);
  const first = path[path.length - 1];
  if (first === undefined) throw new Error('내려가기가 잎에 닿지 않았다');
  const leaves: string[] = [];
  const matched: number[] = [];
  let leafId: string | null = first;
  while (leafId !== null) {
    const leaf = pageById(data, leafId);
    if (leaf.kind !== 'leaf') throw new Error(`잎 사슬에 안쪽 페이지: ${leaf.id}`);
    leaves.push(leaf.id);
    let stop = false;
    for (const k of leaf.keys) {
      if (k > hi) {
        stop = true;
        break;
      }
      if (k >= lo) matched.push(k);
    }
    if (stop) break;
    leafId = leaf.next;
  }
  const rows = matched.map((k) => rowOfKey(data, k));
  const tablePages = rows.map((r) => tablePageOf(data, r));
  return {
    path: 'btree',
    pages: inner.length + leaves.length + tablePages.length,
    indexPages: [...inner, ...leaves],
    descent: path,
    leaves,
    tablePages,
    rows: rows.map(rowId),
  };
}

/** 버킷마다 담긴 열쇠 — 버킷 안 차례 = 표에 넣은 차례. */
export function bucketsOf(data: IndexChoiceData): number[][] {
  const n = data.hash.bucketCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`버킷 수가 잘못됐다: ${n}`);
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const k of data.table.prices) {
    if (k < 0) throw new Error(`음수 열쇠는 이 모형에 없다: ${k}`);
    const b = out[k % n];
    if (!b) throw new Error(`버킷 밖 해시값: ${k % n}`);
    b.push(k);
  }
  return out;
}

export function hashCost(data: IndexChoiceData, lo: number, hi: number): IndexChoiceCost {
  const buckets = bucketsOf(data);
  const opened = lo === hi ? [lo % data.hash.bucketCount] : buckets.map((_, i) => i);
  const matched: number[] = [];
  for (const i of opened) {
    const b = buckets[i];
    if (!b) throw new Error(`버킷 밖 해시값: ${i}`);
    for (const k of b) if (k >= lo && k <= hi) matched.push(k);
  }
  const rows = matched.map((k) => rowOfKey(data, k));
  const tablePages = rows.map((r) => tablePageOf(data, r));
  const ids = opened.map((i) => `B${i}`);
  return {
    path: 'hash',
    pages: opened.length + tablePages.length,
    indexPages: ids,
    descent: [],
    leaves: ids,
    tablePages,
    rows: rows.map(rowId),
  };
}

export function seqCost(data: IndexChoiceData, lo: number, hi: number): IndexChoiceCost {
  const count = tablePageCount(data);
  const pages = Array.from({ length: count }, (_, i) => `T${i + 1}`);
  const rows: string[] = [];
  data.table.prices.forEach((k, i) => {
    if (k >= lo && k <= hi) rows.push(rowId(i + 1));
  });
  return { path: 'seq', pages: count, indexPages: [], descent: [], leaves: [], tablePages: pages, rows };
}

/** 걸린 길마다의 값과 고른 길. 같으면 먼저 적힌 길 (seq → btree → hash). */
export function planOf(
  data: IndexChoiceData,
  setIndex: number,
  queryIndex: number,
): { costs: IndexChoiceCost[]; best: IndexChoiceCost; ties: number } {
  const set = data.indexSets[setIndex];
  const q = data.queries[queryIndex];
  if (!set) throw new Error(`인덱스 사다리에 없는 번호: ${setIndex}`);
  if (!q) throw new Error(`질의 사다리에 없는 번호: ${queryIndex}`);
  const costs = [seqCost(data, q.lo, q.hi)];
  if (set.btree === 1) costs.push(btreeCost(data, q.lo, q.hi));
  if (set.hash === 1) costs.push(hashCost(data, q.lo, q.hi));
  let best = costs[0] as IndexChoiceCost;
  for (const c of costs.slice(1)) if (c.pages < best.pages) best = c;
  const ties = costs.filter((c) => c.pages === best.pages).length - 1;
  return { costs, best, ties };
}

/** INSERT 가 쓰는 페이지 — 표 · (잎) · (버킷). */
export function insertWritesOf(data: IndexChoiceData, setIndex: number): IndexChoiceWrite[] {
  const set = data.indexSets[setIndex];
  if (!set) throw new Error(`인덱스 사다리에 없는 번호: ${setIndex}`);
  const { id, price } = data.insert;
  const n = data.table.prices.length;
  if (id !== n + 1) throw new Error(`INSERT 의 id ${id} 가 다음 줄 자리 ${n + 1} 이 아니다`);
  const writes: IndexChoiceWrite[] = [];

  const tPage = tablePageOf(data, id);
  const tEntries: { key: number; row: string }[] = [];
  data.table.prices.forEach((k, i) => {
    if (tablePageOf(data, i + 1) === tPage) tEntries.push({ key: k, row: rowId(i + 1) });
  });
  if (tEntries.length >= data.table.rowsPerPage) throw new Error(`표 페이지 ${tPage} 에 빈자리가 없다`);
  tEntries.push({ key: price, row: rowId(id) });
  writes.push({ page: tPage, kind: 'table', at: tEntries.length - 1, entries: tEntries });

  if (set.btree === 1) {
    const path = descend(data, price);
    const leafId = path[path.length - 1];
    if (leafId === undefined) throw new Error('내려가기가 잎에 닿지 않았다');
    const leaf = pageById(data, leafId);
    if (leaf.keys.length >= data.btree.leafCapacity) throw new Error(`잎 ${leaf.id} 이 차 있다 — 이 모형은 나눔을 두지 않는다`);
    let at = 0;
    while (at < leaf.keys.length && (leaf.keys[at] as number) <= price) at += 1;
    const keys = [...leaf.keys.slice(0, at), price, ...leaf.keys.slice(at)];
    writes.push({ page: leaf.id, kind: 'leaf', at, entries: keys.map((k) => ({ key: k, row: '' })) });
  }
  if (set.hash === 1) {
    const buckets = bucketsOf(data);
    const bi = price % data.hash.bucketCount;
    const b = buckets[bi];
    if (!b) throw new Error(`버킷 밖 해시값: ${bi}`);
    const keys = [...b, price];
    writes.push({ page: `B${bi}`, kind: 'bucket', at: keys.length - 1, entries: keys.map((k) => ({ key: k, row: '' })) });
  }
  return writes;
}

// ─────────────────────────────────────────────────────────────── 재생

function structureOf(data: IndexChoiceData): Record<string, unknown> {
  const count = tablePageCount(data);
  const tablePages = Array.from({ length: count }, (_, i) => ({ id: `T${i + 1}`, rows: [] as { row: string; key: number }[] }));
  data.table.prices.forEach((k, i) => {
    const page = tablePages[Math.floor(i / data.table.rowsPerPage)];
    if (!page) throw new Error(`줄 r${i + 1} 의 표 페이지가 없다`);
    page.rows.push({ row: rowId(i + 1), key: k });
  });
  return {
    tableName: data.table.name,
    tablePages,
    rowsPerPage: data.table.rowsPerPage,
    btreeName: data.btree.name,
    root: data.btree.root,
    leafCapacity: data.btree.leafCapacity,
    treePages: data.btree.pages.map((p) => ({ id: p.id, kind: p.kind, keys: [...p.keys], children: [...p.children], next: p.next })),
    hashName: data.hash.name,
    bucketCount: data.hash.bucketCount,
    buckets: bucketsOf(data).map((keys, i) => ({ id: `B${i}`, keys })),
  };
}

export async function indexChoiceAlgorithm(ctx0: FacetContext<IndexChoiceData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<IndexChoiceData>;
  const data = ctx.data;
  const step = data.stepMs + data.motionMs;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(step);

  // 지금 보이는 계기 값 — 차이만 보낸다 (계기는 누적 채널이고 손잡이로 다시 도는 판은 되감기가 아니다)
  const shown = new Map<string, number>();
  const showMetric = (name: string, value: number) => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };

  let setIndex = INDEX_CHOICE_DEFAULT_SET;
  let queryIndex = INDEX_CHOICE_DEFAULT_QUERY;

  try {
    await ctx.emit({ type: 'structure', payload: structureOf(data) });
    for (;;) {
      if (ctx.cancelled) return;
      const set = data.indexSets[setIndex];
      const q = data.queries[queryIndex];
      if (!set || !q) throw new Error(`사다리 밖 손잡이 값: ${setIndex} · ${queryIndex}`);
      const { costs, best } = planOf(data, setIndex, queryIndex);

      // 걸음 0 — 처음 모습
      showMetric('pages-read', 0);
      showMetric('pages-written', 0);
      await ctx.emit({
        type: 'round-start',
        payload: { sql: q.sql, insertSql: data.insert.sql, hasBtree: set.btree === 1, hasHash: set.hash === 1 },
      });
      if (!(await pause())) return;

      for (const c of costs) {
        if (ctx.cancelled) return;
        if (c.path === 'seq') await phase('cost-seq');
        else if (c.path === 'btree') await phase('cost-btree');
        else await phase('cost-hash');
        await ctx.emit({
          type: 'cost',
          payload: { ...c, inner: c.descent.length === 0 ? 0 : c.descent.length - 1, leafCount: c.leaves.length, rowCount: c.rows.length },
        });
        if (!(await pause())) return;
      }

      // 걸음 4 — 가장 싼 길로 읽는다
      await phase('pick-cheapest');
      await ctx.emit({
        type: 'pick',
        payload: { path: best.path, pages: best.pages, read: [...best.indexPages, ...best.tablePages], rows: best.rows },
      });
      showMetric('pages-read', best.pages);
      if (!(await pause())) return;

      // 걸음 5 — INSERT 가 걸린 곳마다 쓴다
      const writes = insertWritesOf(data, setIndex);
      await phase('insert-write');
      await ctx.emit({
        type: 'insert',
        payload: { sql: data.insert.sql, row: rowId(data.insert.id), key: data.insert.price, writes, pages: writes.length },
      });
      showMetric('pages-written', writes.length);

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'indexSet' && Number.isInteger(value) && value >= 0 && value < data.indexSets.length) {
          setIndex = value;
          break;
        }
        if (input.type === 'query' && Number.isInteger(value) && value >= 0 && value < data.queries.length) {
          queryIndex = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
