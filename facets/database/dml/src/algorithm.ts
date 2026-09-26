/**
 * dml — 같은 문 셋(INSERT · UPDATE · DELETE)을 손잡이가 고른 차례로 한 표에 차례대로 건다.
 *
 * 주장: 각 문의 WHERE 는 **그 문이 도는 순간의 표**를 본다. 그래서 같은 문 셋도 차례가 끝 표를 바꾼다.
 *
 * SQL 은 파싱하지 않는다. 문의 종류 · 조건(열 · 비교 · 문턱) · 더할 값 · 넣을 줄은 `initialData` 에
 * 구조로 있고, SQL 글자(`sql`)는 보이기용 자료다.
 *
 * 규약
 *   - 문은 하나씩 끝까지 돈다. UPDATE · DELETE 는 먼저 살아 있는 줄 전부를 판정하고 걸린 줄 전부에
 *     한꺼번에 적용한다. `water + 7` 은 고치기 전 값으로 셈한다. 비교는 엄격하다 (`<` · `>`).
 *   - 줄은 처음 차례(id 차례)로 두고 INSERT 의 줄은 끝에 붙는다. 줄의 자리 번호(slot)는 처음 줄이
 *     0 부터, INSERT 의 줄은 처음 줄 수 — IR 의 버퍼 자리와 같다.
 *   - INSERT 의 줄은 스키마(열 수 · INT 는 정수 · VARCHAR(n) 은 n 글자 이하)에 맞춰 보고, 맞지 않으면 던진다.
 *   - 영향받은 줄 = 문이 넣은 · 고친 · 지운 줄 수. 0 도 수다.
 *   - 동률은 없다 — 비교는 정수 하나와 문턱 하나다. 문턱과 같은 값(ivy 7 · `water > 7`)은 걸리지 않는다.
 *
 * 이벤트 (모두 `await ctx.emit`)
 *   - `order-set`  (걸음) 판의 걸음 0. payload
 *       { order: string, statements: { position: number, key: string, kind: DmlKind, sql: string[] }[],
 *         schemaSql: string[], table: string, columns: string[], rows: DmlRowOut[], rowCount: number }
 *       position 은 1 부터. rows 는 처음 줄들.
 *   - `statement`  (걸음) 문 하나. payload
 *       { step: number, key: string, kind: DmlKind, seen: number, whereColumn: number,
 *         hits: number[], changes: { slot: number, column: number, from: number, to: number }[],
 *         inserted: DmlRowOut | null, removed: number[], rows: DmlRowOut[], affected: number, rowCount: number }
 *       step 은 1 부터. seen = WHERE 가 본 줄 수 (INSERT 는 WHERE 가 없어 -1, whereColumn 도 -1).
 *       hits = 걸린 줄의 slot. rows = 문이 끝난 뒤의 표.
 *   - `phase`      (silent) { phase: 'insert-row' | 'update-row' | 'delete-row' }
 *   DmlRowOut = { slot: number, values: (number | string)[] }
 *
 * phase 어휘 (irs.ts 와 같다) — `insert-row` · `update-row` · `delete-row`.
 *   걸음 k(1..3) 에서 k 번째 문의 phase 하나가 켜진다. 영향 0 인 문도 켜진다 (훑기는 돈다).
 *
 * 계기
 *   - `end-rows`      지금 표의 줄 수 (걸음 0 에서 처음 줄 수)
 *   - `updated-rows`  UPDATE 의 영향 수 (UPDATE 걸음에서)
 *   - `deleted-rows`  DELETE 의 영향 수 (DELETE 걸음에서)
 *   판의 걸음 0 에서 end-rows 는 처음 줄 수, 나머지는 0 으로 되돌린다.
 *
 * 손잡이 `order` — 값 0.. 은 `orders` 의 자리. 한 판을 끝까지 재생하고 입력을 기다린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DmlKind = 'INSERT' | 'UPDATE' | 'DELETE';
export type DmlValue = number | string;

export type DmlColumn = {
  name: string;
  /** INT 또는 VARCHAR. VARCHAR 는 size 글자까지 */
  sqlType: 'INT' | 'VARCHAR';
  size?: number;
  notNull: boolean;
};

export type DmlStatement =
  | { key: string; kind: 'INSERT'; sql: string[]; values: DmlValue[] }
  | {
      key: string;
      kind: 'UPDATE';
      sql: string[];
      setColumn: string;
      add: number;
      whereColumn: string;
      test: '<' | '>';
      bound: number;
    }
  | { key: string; kind: 'DELETE'; sql: string[]; whereColumn: string; test: '<' | '>'; bound: number };

export type DmlData = {
  type: 'dml';
  stepMs: number;
  table: string;
  /** CREATE TABLE 문 — 보이기용 글자 */
  schemaSql: string[];
  columns: DmlColumn[];
  /** 처음 줄들 (열 차례의 값) */
  rows: DmlValue[][];
  statements: DmlStatement[];
  /** 손잡이 사다리 — 자리 i 가 segments[].value i. 글자마다 문의 key */
  orders: string[];
  /** 손잡이의 처음 값 */
  order: number;
};

export type DmlRowOut = { slot: number; values: DmlValue[] };

type Row = { slot: number; values: DmlValue[] };

/** INSERT 의 줄이 스키마에 맞는지 본다. 맞지 않으면 던진다 (거절 장면은 그리지 않는다). */
export function checkRowAgainstSchema(columns: DmlColumn[], values: DmlValue[]): void {
  if (values.length !== columns.length) {
    throw new Error(`dml: 값 ${values.length} 개가 열 ${columns.length} 개와 맞지 않는다`);
  }
  columns.forEach((col, i) => {
    const v = values[i];
    if (col.sqlType === 'INT') {
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        throw new Error(`dml: 열 ${col.name} 은 INT 인데 값이 정수가 아니다`);
      }
    } else {
      if (typeof v !== 'string') throw new Error(`dml: 열 ${col.name} 은 VARCHAR 인데 값이 글자가 아니다`);
      if (col.size === undefined) throw new Error(`dml: VARCHAR 열 ${col.name} 에 size 가 없다`);
      if (v.length > col.size) throw new Error(`dml: 열 ${col.name} 의 값이 ${col.size} 글자를 넘는다`);
    }
  });
}

function columnIndex(data: DmlData, name: string): number {
  const i = data.columns.findIndex((c) => c.name === name);
  if (i < 0) throw new Error(`dml: 모르는 열 ${name}`);
  return i;
}

function numberAt(row: Row, col: number): number {
  const v = row.values[col];
  if (typeof v !== 'number') throw new Error(`dml: 줄 ${row.slot} 의 칸 ${col} 이 수가 아니다`);
  return v;
}

function passes(value: number, test: '<' | '>', bound: number): boolean {
  if (test === '<') return value < bound;
  if (test === '>') return value > bound;
  throw new Error(`dml: 모르는 비교 ${String(test)}`);
}

/** 차례 글자(`'IUD'`)를 문 셋으로 푼다. 셋이 모두 한 번씩 들어 있지 않으면 던진다. */
export function statementsInOrder(data: DmlData, order: string): DmlStatement[] {
  const keys = [...order];
  if (keys.length !== data.statements.length) throw new Error(`dml: 차례 ${order} 의 길이가 문 수와 다르다`);
  const out = keys.map((k) => {
    const st = data.statements.find((s) => s.key === k);
    if (!st) throw new Error(`dml: 차례 ${order} 에 모르는 문 ${k}`);
    return st;
  });
  if (new Set(keys).size !== keys.length) throw new Error(`dml: 차례 ${order} 에 같은 문이 둘 있다`);
  return out;
}

const copyRows = (rows: Row[]): DmlRowOut[] => rows.map((r) => ({ slot: r.slot, values: [...r.values] }));

export async function dmlAlgorithm(baseCtx: FacetContext<DmlData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<DmlData>;
  const data = ctx.data;
  if (data.orders.length === 0) throw new Error('dml: orders 가 비었다');
  for (const r of data.rows) checkRowAgainstSchema(data.columns, r);

  // 지금 보이는 계기 값 — 차이만 보낸다 (계기는 누적 채널이다)
  const shown: Record<'end-rows' | 'updated-rows' | 'deleted-rows', number> = {
    'end-rows': 0,
    'updated-rows': 0,
    'deleted-rows': 0,
  };
  const setMetric = (name: 'end-rows' | 'updated-rows' | 'deleted-rows', value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playOnce = async (orderIndex: number): Promise<boolean> => {
    const order = data.orders[orderIndex];
    if (order === undefined) throw new Error(`dml: 차례 자리 ${orderIndex} 가 사다리 밖이다`);
    const statements = statementsInOrder(data, order);
    let rows: Row[] = data.rows.map((values, slot) => ({ slot, values: [...values] }));

    // 걸음 0 — 스키마 · 처음 줄 · 이 차례의 문 셋
    setMetric('end-rows', rows.length);
    setMetric('updated-rows', 0);
    setMetric('deleted-rows', 0);
    await ctx.emit({
      type: 'order-set',
      payload: {
        order,
        statements: statements.map((s, i) => ({ position: i + 1, key: s.key, kind: s.kind, sql: [...s.sql] })),
        schemaSql: [...data.schemaSql],
        table: data.table,
        columns: data.columns.map((c) => c.name),
        rows: copyRows(rows),
        rowCount: rows.length,
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    for (let k = 0; k < statements.length; k++) {
      if (ctx.cancelled) return false;
      const st = statements[k];
      if (st === undefined) throw new Error(`dml: 문 ${k} 가 없다`);

      if (st.kind === 'INSERT') {
        await phase('insert-row');
        checkRowAgainstSchema(data.columns, st.values);
        const row: Row = { slot: data.rows.length, values: [...st.values] };
        rows = [...rows, row];
        await ctx.emit({
          type: 'statement',
          payload: {
            step: k + 1,
            key: st.key,
            kind: st.kind,
            seen: -1,
            whereColumn: -1,
            hits: [row.slot],
            changes: [],
            inserted: { slot: row.slot, values: [...row.values] },
            removed: [],
            rows: copyRows(rows),
            affected: 1,
            rowCount: rows.length,
          },
        });
        setMetric('end-rows', rows.length);
      } else if (st.kind === 'UPDATE') {
        await phase('update-row');
        const where = columnIndex(data, st.whereColumn);
        const target = columnIndex(data, st.setColumn);
        // 먼저 모든 줄을 판정하고, 걸린 줄에 한꺼번에 — 고치기 전 값으로 셈한다
        const hit = rows.filter((r) => passes(numberAt(r, where), st.test, st.bound));
        const changes = hit.map((r) => {
          const from = numberAt(r, target);
          return { slot: r.slot, column: target, from, to: from + st.add };
        });
        const seen = rows.length;
        rows = rows.map((r) => {
          const c = changes.find((x) => x.slot === r.slot);
          if (!c) return r;
          const values = [...r.values];
          values[target] = c.to;
          return { slot: r.slot, values };
        });
        await ctx.emit({
          type: 'statement',
          payload: {
            step: k + 1,
            key: st.key,
            kind: st.kind,
            seen,
            whereColumn: where,
            hits: hit.map((r) => r.slot),
            changes,
            inserted: null,
            removed: [],
            rows: copyRows(rows),
            affected: changes.length,
            rowCount: rows.length,
          },
        });
        setMetric('updated-rows', changes.length);
      } else if (st.kind === 'DELETE') {
        await phase('delete-row');
        const where = columnIndex(data, st.whereColumn);
        const hit = rows.filter((r) => passes(numberAt(r, where), st.test, st.bound));
        const seen = rows.length;
        const removed = hit.map((r) => r.slot);
        rows = rows.filter((r) => !removed.includes(r.slot));
        await ctx.emit({
          type: 'statement',
          payload: {
            step: k + 1,
            key: st.key,
            kind: st.kind,
            seen,
            whereColumn: where,
            hits: removed,
            changes: [],
            inserted: null,
            removed,
            rows: copyRows(rows),
            affected: removed.length,
            rowCount: rows.length,
          },
        });
        setMetric('deleted-rows', removed.length);
        setMetric('end-rows', rows.length);
      } else {
        throw new Error('dml: 모르는 문 종류');
      }
      if (!(await ctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  /** 손잡이 입력을 기다린다. 취소되면 null. 사다리 밖의 값은 던진다. */
  const nextOrder = async (): Promise<number | null> => {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'order') continue;
      const p = input.payload;
      if (typeof p !== 'object' || p === null || !('value' in p)) throw new Error('dml: order 입력에 value 가 없다');
      const v = (p as { value: unknown }).value;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= data.orders.length) {
        throw new Error(`dml: 손잡이 값 ${String(v)} 이 사다리 밖이다`);
      }
      return v;
    }
  };

  try {
    let orderIndex = data.order;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playOnce(orderIndex))) return;
      const next = await nextOrder();
      if (next === null) return;
      orderIndex = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
