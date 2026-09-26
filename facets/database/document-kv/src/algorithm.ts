/**
 * 문서와 키-값 — 같은 주문 셋을 표 셋 · 문서 · 키-값으로 담고, 같은 질의 셋이 몇 덩어리를 건드리는지 센다.
 *
 * 손잡이 둘 (reactive):
 *   layout  0 표 셋 · 1 문서 · 2 키-값      (사다리 `layoutLadder`)
 *   query   0 통째 읽기 · 1 값 속 조건 · 2 사실 고치기   (사다리 `queryLadder`)
 * 한 판을 끝까지 재생 → `waitForInput` → 받은 값으로 다시 재생. 판마다 자료는 `ctx.data` 에서 새로 시작한다.
 *
 * 규약 (sim.py `document_kv_round` 그대로)
 *   - 문서와 키-값의 값은 1차 데이터가 아니다 — 표 셋에서 주문마다 하나씩 접는다.
 *     필드 차례 `id` · `date` · `customer` { `name` · `city` } · `items` [ { `product` · `qty` } ].
 *     items 는 표에 적힌 차례. 주문이 없는 손님(c3)은 어디에도 담기지 않는다
 *   - 키-값의 열쇠는 `order:<id>`, 값은 그 문서의 JSON 글자. 저장소는 속을 모른다
 *   - 찾는 칸마다 색인이 있다고 치고 색인 읽기는 세지 않는다 — 덩어리(줄 · 문서 · 값)만 센다
 *   - 표 셋  통째: orders 한 줄 → customers 한 줄 → items 에서 order_id 가 맞는 줄을 표 차례로
 *            조건: customers 에서 조건 맞는 줄 → orders 에서 customer_id 가 그 손님인 줄을 표 차례로
 *            고치기: customers 에서 name 이 맞는 줄마다 쓰기 1
 *   - 문서   통째: 문서 하나. 조건: customer.<field> 가 맞는 문서를 문서 차례로.
 *            고치기: customer.name 이 맞는 문서마다 쓰기 1
 *   - 키-값  통째: GET 하나. 조건: 열쇠 차례로 전부 GET 해서 밖에서 연다 (맞아도 멈추지 않는다).
 *            고치기: 열쇠 차례로 GET 해서 밖에서 열고, name 이 맞으면 곧바로 값 통째로 PUT
 *   - 가장 적게 건드린 쪽 = 읽기 + 쓰기 가 가장 작은 담는 법. 동률이면 모두 표시한다
 *     (이 자료에서 통째 읽기의 문서 · 키-값 1 = 1 이 실제로 걸린다)
 *   - 문서 · 값 속에 찾는 필드가 없거나, 모르는 열쇠 · 손님 · 사다리 밖 손잡이 값을 만나면 던진다
 *
 * 이벤트 (phase 는 보내지 않는다 — IR 을 두지 않는다. `irs.ts` 참고)
 *   store       { layout, query, queryKind, order?, field?, value?, name?,
 *                 tables?: { name, columns: string[], rows: { id, cells: string[], link: number|null }[] }[],
 *                 docs?: { id: string, link: number, lines: string[] }[],
 *                 entries?: { id: string, key: string, link: number, size: number }[] }   — 걸음 0
 *   read-row    { id, table, pos (1 부터), cells: string[], reads, writes }
 *   read-doc    { id, doc: number, reads, writes }
 *   get         { id, key, lines: string[], field: string|null, found: string|null, hit: boolean|null, reads, writes }
 *   write-row   { id, table, pos, column, value, cells: string[], reads, writes }
 *   write-doc   { id, doc: number, path, value, lines: string[], reads, writes }
 *   put         { id, key, lines: string[], reads, writes }
 *   done        { queryKind, (whole) order · name · itemCount | (where) ids: number[] | (update) copies,
 *                 reads, writes, tally: { layout, reads, writes, total, fewest: boolean }[] }
 *   어느 것도 silent 가 아니다. 걸음 경계는 `ctx.sleep` 과 입력 대기뿐이다.
 *
 * 계기 (C5) — 판마다 지금 값을 들고 차이만 보낸다. 판 첫머리에 0 으로 되돌린다 (첫 판에도 0 을 보낸다).
 *   reads   꺼낸 덩어리 수 (read-row · read-doc · get)
 *   writes  고쳐 넣은 덩어리 수 (write-row · write-doc · put)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Customer = { id: string; name: string; city: string };
export type Order = { id: number; customer_id: string; date: string };
export type Item = { order_id: number; product: string; qty: number };
export type Query =
  | { kind: 'whole'; order: number }
  | { kind: 'where'; field: string; value: string }
  | { kind: 'update'; name: string; field: string; value: string };

export type DocumentKvData = {
  type: 'document-kv';
  stepMs: number;
  customers: Customer[];
  orders: Order[];
  items: Item[];
  queries: Query[];
  layoutLadder: number[];
  queryLadder: number[];
  layout: number;
  query: number;
};

/** 표 셋에서 주문마다 접은 문서 — 키-값의 값과 같은 내용이다. */
export type Doc = {
  id: number;
  date: string;
  customer: { name: string; city: string };
  items: { product: string; qty: number }[];
};

export type Op =
  | { kind: 'read-row'; id: string; table: string; pos: number; cells: string[] }
  | { kind: 'write-row'; id: string; table: string; pos: number; column: string; value: string; cells: string[] }
  | { kind: 'read-doc'; id: string; doc: number }
  | { kind: 'write-doc'; id: string; doc: number; path: string; value: string; lines: string[] }
  | { kind: 'get'; id: string; key: string; lines: string[]; field: string | null; found: string | null; hit: boolean | null }
  | { kind: 'put'; id: string; key: string; lines: string[] };

/** 질의 종류마다 그 답에 필요한 것만. */
export type Answer =
  | { queryKind: 'whole'; order: number; name: string; itemCount: number }
  | { queryKind: 'where'; ids: number[] }
  | { queryKind: 'update'; copies: number };

export type Plan = { ops: Op[]; reads: number; writes: number; answer: Answer };

const TABLES = ['customers', 'orders', 'items'] as const;

export function isRead(op: Op): boolean {
  return op.kind === 'read-row' || op.kind === 'read-doc' || op.kind === 'get';
}

/** 행 객체의 칸들을 글자로 — 열 차례는 자료에 적힌 열쇠 차례다. */
function cellsOf(row: Record<string, string | number>): string[] {
  return Object.values(row).map((v) => String(v));
}

function customerOf(data: DocumentKvData, id: string): Customer {
  const c = data.customers.find((x) => x.id === id);
  if (!c) throw new Error(`document-kv: 모르는 손님 ${id}`);
  return c;
}

/** 표 셋에서 주문마다 문서 하나를 접는다 (nested-document 의 필드 차례). */
export function foldDocuments(data: DocumentKvData): Doc[] {
  return data.orders.map((o) => {
    const c = customerOf(data, o.customer_id);
    return {
      id: o.id,
      date: o.date,
      customer: { name: c.name, city: c.city },
      items: data.items.filter((it) => it.order_id === o.id).map((it) => ({ product: it.product, qty: it.qty })),
    };
  });
}

/** 문서의 JSON 글자를 줄로 — 키-값의 값은 이 줄들을 이은 글자 그대로다. */
export function docLines(d: Doc): string[] {
  const s = JSON.stringify;
  const lines = [
    `{${s('id')}: ${d.id}, ${s('date')}: ${s(d.date)},`,
    ` ${s('customer')}: {${s('name')}: ${s(d.customer.name)}, ${s('city')}: ${s(d.customer.city)}},`,
  ];
  if (d.items.length === 0) lines.push(` ${s('items')}: []}`);
  d.items.forEach((it, i) => {
    const head = i === 0 ? ` ${s('items')}: [` : '           ';
    const tail = i === d.items.length - 1 ? ']}' : ',';
    lines.push(`${head}{${s('product')}: ${s(it.product)}, ${s('qty')}: ${it.qty}}${tail}`);
  });
  return lines;
}

export function keyOf(id: number): string {
  return `order:${id}`;
}

/** 밖에서 연다 — 저장소가 돌려준 값 글자를 풀어 문서로 읽는다. 모양이 다르면 던진다. */
export function openValue(value: string): Doc {
  const raw: unknown = JSON.parse(value);
  if (typeof raw !== 'object' || raw === null) throw new Error('document-kv: 값이 객체가 아니다');
  const o = raw as { id?: unknown; date?: unknown; customer?: unknown; items?: unknown };
  if (typeof o.id !== 'number' || typeof o.date !== 'string') throw new Error('document-kv: 값에 id · date 가 없다');
  if (typeof o.customer !== 'object' || o.customer === null) throw new Error('document-kv: 값에 customer 가 없다');
  const c = o.customer as { name?: unknown; city?: unknown };
  if (typeof c.name !== 'string' || typeof c.city !== 'string') throw new Error('document-kv: customer 에 name · city 가 없다');
  if (!Array.isArray(o.items)) throw new Error('document-kv: 값에 items 가 없다');
  const items = o.items.map((x: unknown) => {
    const it = x as { product?: unknown; qty?: unknown };
    if (typeof it !== 'object' || it === null || typeof it.product !== 'string' || typeof it.qty !== 'number') {
      throw new Error('document-kv: items 의 모양이 다르다');
    }
    return { product: it.product, qty: it.qty };
  });
  return { id: o.id, date: o.date, customer: { name: c.name, city: c.city }, items };
}

function customerField(c: { name: string; city: string }, field: string): string {
  if (field === 'name') return c.name;
  if (field === 'city') return c.city;
  throw new Error(`document-kv: customer 에 ${field} 필드가 없다`);
}

function withCustomerField<T extends { name: string; city: string }>(c: T, field: string, value: string): T {
  if (field === 'name') return { ...c, name: value };
  if (field === 'city') return { ...c, city: value };
  throw new Error(`document-kv: customer 에 ${field} 필드가 없다`);
}

function rowId(table: string, index: number): string {
  return `row:${table}:${index}`;
}

/** 담는 법 하나 · 질의 하나의 걸음 차례와 답. 화면과 대조표가 모두 이것 하나에서 나온다. */
export function planOf(data: DocumentKvData, layout: number, queryIndex: number): Plan {
  const q = data.queries[queryIndex];
  if (!q) throw new Error(`document-kv: 질의 ${queryIndex} 가 없다`);
  const ops: Op[] = [];
  let whole: { order: number; name: string; itemCount: number } | null = null;
  const ids: number[] = [];
  let copies = 0;
  const docs = foldDocuments(data);

  if (layout === 0) {
    if (q.kind === 'whole') {
      const oi = data.orders.findIndex((o) => o.id === q.order);
      const o = data.orders[oi];
      if (!o) throw new Error(`document-kv: 주문 ${q.order} 가 없다`);
      ops.push({ kind: 'read-row', id: rowId('orders', oi), table: 'orders', pos: oi + 1, cells: cellsOf(o) });
      const ci = data.customers.findIndex((c) => c.id === o.customer_id);
      const c = data.customers[ci];
      if (!c) throw new Error(`document-kv: 모르는 손님 ${o.customer_id}`);
      ops.push({ kind: 'read-row', id: rowId('customers', ci), table: 'customers', pos: ci + 1, cells: cellsOf(c) });
      let n = 0;
      data.items.forEach((it, i) => {
        if (it.order_id !== q.order) return;
        ops.push({ kind: 'read-row', id: rowId('items', i), table: 'items', pos: i + 1, cells: cellsOf(it) });
        n += 1;
      });
      whole = { order: o.id, name: c.name, itemCount: n };
    } else if (q.kind === 'where') {
      const who = new Set<string>();
      data.customers.forEach((c, i) => {
        if (customerField(c, q.field) !== q.value) return;
        ops.push({ kind: 'read-row', id: rowId('customers', i), table: 'customers', pos: i + 1, cells: cellsOf(c) });
        who.add(c.id);
      });
      data.orders.forEach((o, i) => {
        if (!who.has(o.customer_id)) return;
        ops.push({ kind: 'read-row', id: rowId('orders', i), table: 'orders', pos: i + 1, cells: cellsOf(o) });
        ids.push(o.id);
      });
    } else {
      data.customers.forEach((c, i) => {
        if (c.name !== q.name) return;
        const after = withCustomerField(c, q.field, q.value);
        ops.push({ kind: 'write-row', id: rowId('customers', i), table: 'customers', pos: i + 1, column: q.field, value: q.value, cells: cellsOf(after) });
        copies += 1;
      });
    }
  } else if (layout === 1) {
    if (q.kind === 'whole') {
      const d = docs.find((x) => x.id === q.order);
      if (!d) throw new Error(`document-kv: 문서 ${q.order} 가 없다`);
      ops.push({ kind: 'read-doc', id: `doc:${d.id}`, doc: d.id });
      whole = { order: d.id, name: d.customer.name, itemCount: d.items.length };
    } else if (q.kind === 'where') {
      for (const d of docs) {
        if (customerField(d.customer, q.field) !== q.value) continue;
        ops.push({ kind: 'read-doc', id: `doc:${d.id}`, doc: d.id });
        ids.push(d.id);
      }
    } else {
      for (const d of docs) {
        if (d.customer.name !== q.name) continue;
        const after = { ...d, customer: withCustomerField(d.customer, q.field, q.value) };
        ops.push({ kind: 'write-doc', id: `doc:${d.id}`, doc: d.id, path: `customer.${q.field}`, value: q.value, lines: docLines(after) });
        copies += 1;
      }
    }
  } else if (layout === 2) {
    // 저장소: 열쇠 → 값 글자. 앱은 열쇠 목록만 안다.
    const store = new Map<string, string>(docs.map((d) => [keyOf(d.id), docLines(d).join('\n')]));
    const getValue = (key: string): string => {
      const v = store.get(key);
      if (v === undefined) throw new Error(`document-kv: 열쇠 ${key} 가 없다`);
      return v;
    };
    if (q.kind === 'whole') {
      const key = keyOf(q.order);
      const value = getValue(key);
      ops.push({ kind: 'get', id: `kv:${key}`, key, lines: value.split('\n'), field: null, found: null, hit: null });
      const d = openValue(value);
      whole = { order: d.id, name: d.customer.name, itemCount: d.items.length };
    } else {
      for (const key of store.keys()) {
        const value = getValue(key);
        const d = openValue(value); // 밖에서 연다
        const field = q.kind === 'where' ? q.field : 'name';
        const want = q.kind === 'where' ? q.value : q.name;
        const found = customerField(d.customer, field);
        const hit = found === want;
        ops.push({ kind: 'get', id: `kv:${key}`, key, lines: value.split('\n'), field: `customer.${field}`, found, hit });
        if (!hit) continue;
        if (q.kind === 'where') {
          ids.push(d.id);
        } else {
          const after = docLines({ ...d, customer: withCustomerField(d.customer, q.field, q.value) });
          store.set(key, after.join('\n'));
          ops.push({ kind: 'put', id: `kv:${key}`, key, lines: after });
          copies += 1;
        }
      }
    }
  } else {
    throw new Error(`document-kv: 모르는 담는 법 ${layout}`);
  }

  const reads = ops.filter(isRead).length;
  let answer: Answer;
  if (q.kind === 'whole') {
    if (!whole) throw new Error(`document-kv: 주문 ${q.order} 의 답을 셈하지 못했다`);
    answer = { queryKind: 'whole', ...whole };
  } else if (q.kind === 'where') {
    answer = { queryKind: 'where', ids };
  } else {
    answer = { queryKind: 'update', copies };
  }
  return { ops, reads, writes: ops.length - reads, answer };
}

/** 저장소 모양 — 걸음 0 에 그린다. 키-값은 값 글자를 싣지 않는다 (저장소는 속을 모른다 · 무대도 GET 전에는 모른다). */
function storePayload(data: DocumentKvData, layout: number): Record<string, unknown> {
  const docs = foldDocuments(data);
  if (layout === 0) {
    const firstOrderOf = (cid: string): number | null => data.orders.find((o) => o.customer_id === cid)?.id ?? null;
    const tables = TABLES.map((name) => {
      const rows: Record<string, string | number>[] = data[name];
      const first = rows[0];
      if (!first) throw new Error(`document-kv: 표 ${name} 가 비었다`);
      return {
        name,
        columns: Object.keys(first),
        rows: rows.map((r, i) => ({
          id: rowId(name, i),
          cells: cellsOf(r),
          link:
            name === 'customers'
              ? firstOrderOf(String(r.id))
              : name === 'orders'
                ? Number(r.id)
                : Number(r.order_id),
        })),
      };
    });
    return { tables };
  }
  if (layout === 1) return { docs: docs.map((d) => ({ id: `doc:${d.id}`, link: d.id, lines: docLines(d) })) };
  if (layout === 2) {
    return {
      entries: docs.map((d) => ({ id: `kv:${keyOf(d.id)}`, key: keyOf(d.id), link: d.id, size: docLines(d).join('\n').length })),
    };
  }
  throw new Error(`document-kv: 모르는 담는 법 ${layout}`);
}

function queryVars(q: Query): Record<string, string | number> {
  if (q.kind === 'whole') return { order: q.order };
  if (q.kind === 'where') return { field: q.field, value: q.value };
  return { name: q.name, field: q.field, value: q.value };
}

export async function documentKvAlgorithm(base: FacetContext<DocumentKvData>): Promise<void> {
  const ctx = base as ReactiveContext<DocumentKvData>;
  const data = ctx.data;
  if (!data.layoutLadder.includes(data.layout)) throw new Error(`document-kv: 첫 담는 법 ${data.layout} 가 사다리 밖이다`);
  if (!data.queryLadder.includes(data.query)) throw new Error(`document-kv: 첫 질의 ${data.query} 가 사다리 밖이다`);
  let layout = data.layout;
  let query = data.query;

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 0 이어도 보낸다.
  const shown = { reads: 0, writes: 0 };
  const showCounts = (reads: number, writes: number): void => {
    ctx.metric('reads', reads - shown.reads);
    ctx.metric('writes', writes - shown.writes);
    shown.reads = reads;
    shown.writes = writes;
  };

  const playRound = async (): Promise<boolean> => {
    const q = data.queries[query];
    if (!q) throw new Error(`document-kv: 질의 ${query} 가 없다`);
    const plan = planOf(data, layout, query);
    showCounts(0, 0);
    await ctx.emit({ type: 'store', payload: { layout, query, queryKind: q.kind, ...queryVars(q), ...storePayload(data, layout) } });
    if (!(await ctx.sleep(data.stepMs))) return false;

    let reads = 0;
    let writes = 0;
    for (const op of plan.ops) {
      if (ctx.cancelled) return false;
      if (isRead(op)) reads += 1;
      else writes += 1;
      showCounts(reads, writes);
      const counts = { reads, writes };
      if (op.kind === 'read-row') await ctx.emit({ type: 'read-row', payload: { ...op, ...counts } });
      else if (op.kind === 'read-doc') await ctx.emit({ type: 'read-doc', payload: { ...op, ...counts } });
      else if (op.kind === 'get') await ctx.emit({ type: 'get', payload: { ...op, ...counts } });
      else if (op.kind === 'write-row') await ctx.emit({ type: 'write-row', payload: { ...op, ...counts } });
      else if (op.kind === 'write-doc') await ctx.emit({ type: 'write-doc', payload: { ...op, ...counts } });
      else await ctx.emit({ type: 'put', payload: { ...op, ...counts } });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    const all = data.layoutLadder.map((l) => {
      const p = planOf(data, l, query);
      return { layout: l, reads: p.reads, writes: p.writes };
    });
    const least = Math.min(...all.map((x) => x.reads + x.writes));
    const tally = all.map((x) => ({ ...x, total: x.reads + x.writes, fewest: x.reads + x.writes === least }));
    await ctx.emit({
      type: 'done',
      payload: { ...plan.answer, reads: plan.reads, writes: plan.writes, tally },
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'layout' && input.type !== 'query') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') throw new Error(`document-kv: ${input.type} 의 값이 수가 아니다`);
        const ladder = input.type === 'layout' ? data.layoutLadder : data.queryLadder;
        if (!ladder.includes(value)) throw new Error(`document-kv: ${input.type} 값 ${value} 가 사다리 밖이다`);
        if (input.type === 'layout') layout = value;
        else query = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
