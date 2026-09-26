/**
 * all-or-nothing — 원자성. 트랜잭션 가운데 한 문장이 실패하면 앞서 성공한 문장들은
 * 되돌림 기록의 역순으로 옛 값에 되감긴다.
 *
 * 규약 (사양 그대로):
 *  - 본문은 `BEGIN;` 으로 열고 `COMMIT;` 으로 닫는다. 그 사이 줄은 전부
 *    `UPDATE <표> SET <열> = <열> {+|-} <정수> WHERE <열쇠 열> = '<열쇠>';` 꼴이다.
 *    다른 꼴은 줄 번호를 담아 던진다.
 *  - 문장 하나는 한 줄의 값 하나를 바꾼다. 쓰기마다 되돌림 기록에
 *    (표, 열쇠, 옛 값, 새 값) 한 칸을 붙인다.
 *  - CHECK 는 새 값을 쓰기 전에 본다. 어기는 문장은 아무것도 바꾸지 않고
 *    되돌림 기록에도 칸을 붙이지 않는다 (문장 단위 원자성).
 *  - 한 문장이 실패하면 엔진이 트랜잭션을 되돌린다 — 그 뒤 줄(`COMMIT;` 포함)은 실행되지 않는다.
 *  - 되돌림 = 되돌림 기록을 뒤에서부터 한 칸씩 옛 값으로 되쓴다. 한 칸 = 한 걸음.
 *
 * 이벤트 (모두 silent 아님, 한 걸음 = 사건 하나):
 *  - write  { line, table, key, before, after, entries }
 *      line: 본문 줄 번호(0 부터), entries: 붙인 뒤 되돌림 기록 칸 수
 *  - reject { line, table, key, before, attempted, entries, skipped }
 *      attempted: 쓰려던 새 값, entries: 되돌림 기록 칸 수(그대로), skipped: 실행되지 않는 줄 번호들
 *  - commit { line, entries } — 모든 문장이 성공했을 때만
 *  - undo   { slot, table, key, from, to, left, restored, total }
 *      slot: 되감은 칸 번호(1 부터), from → to: 지금 값 → 옛 값, left: 남은 칸 수,
 *      restored: 처음 값과 같은 줄 수, total: 줄 수
 *
 * 걸음 0 은 처음 상태(본문 · 표)라 읽을 것이 있다 — 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AllOrNothingCheck = { op: '>='; bound: number };

export type AllOrNothingRow = { key: string; value: number };

export type AllOrNothingTable = {
  name: string;
  keyColumn: string;
  column: string;
  check: AllOrNothingCheck;
  rows: AllOrNothingRow[];
};

export type AllOrNothingFacetData = {
  type: 'all-or-nothing';
  stepMs: number;
  tables: AllOrNothingTable[];
  body: string[];
};

type Update = { line: number; table: AllOrNothingTable; key: string; delta: number };

const UPDATE_SHAPE = /^UPDATE (\w+) SET (\w+) = (\w+) ([+-]) (\d+) WHERE (\w+) = '([^']+)';$/;

function parseUpdate(text: string, line: number, tables: AllOrNothingTable[]): Update {
  const m = UPDATE_SHAPE.exec(text);
  if (!m) throw new Error(`all-or-nothing: 줄 ${line} — 모르는 문장 꼴: ${text}`);
  const [, tableName, column, source, sign, amount, keyColumn, key] = m;
  if (
    tableName === undefined ||
    column === undefined ||
    source === undefined ||
    sign === undefined ||
    amount === undefined ||
    keyColumn === undefined ||
    key === undefined
  ) {
    throw new Error(`all-or-nothing: 줄 ${line} — 문장 조각을 읽지 못했다`);
  }
  const table = tables.find((tb) => tb.name === tableName);
  if (!table) throw new Error(`all-or-nothing: 줄 ${line} — 없는 표 ${tableName}`);
  if (column !== table.column || source !== table.column) {
    throw new Error(`all-or-nothing: 줄 ${line} — 표 ${tableName} 에 없는 열 ${column}/${source}`);
  }
  if (keyColumn !== table.keyColumn) {
    throw new Error(`all-or-nothing: 줄 ${line} — 열쇠 열이 ${table.keyColumn} 이 아니다: ${keyColumn}`);
  }
  if (!table.rows.some((r) => r.key === key)) {
    throw new Error(`all-or-nothing: 줄 ${line} — 표 ${tableName} 에 없는 줄 ${key}`);
  }
  const n = Number(amount);
  return { line, table, key, delta: sign === '-' ? -n : n };
}

function holds(check: AllOrNothingCheck, value: number): boolean {
  if (check.op === '>=') return value >= check.bound;
  throw new Error(`all-or-nothing: 모르는 CHECK 연산 ${String(check.op)}`);
}

function readData(raw: unknown): AllOrNothingFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('all-or-nothing: 데이터가 없다');
  const d = raw as Partial<AllOrNothingFacetData>;
  if (d.type !== 'all-or-nothing') throw new Error('all-or-nothing: type 이 다르다');
  if (typeof d.stepMs !== 'number') throw new Error('all-or-nothing: stepMs 가 없다');
  if (!Array.isArray(d.tables) || d.tables.length === 0) throw new Error('all-or-nothing: 표가 없다');
  if (!Array.isArray(d.body) || d.body.length < 2) throw new Error('all-or-nothing: 본문이 없다');
  return d as AllOrNothingFacetData;
}

export async function allOrNothing(rawCtx: FacetContext<AllOrNothingFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<AllOrNothingFacetData>;
  const data = readData(ctx.data);
  const { stepMs, body } = data;

  if (body[0] !== 'BEGIN;') throw new Error('all-or-nothing: 줄 0 — BEGIN; 이 아니다');
  const last = body.length - 1;
  if (body[last] !== 'COMMIT;') throw new Error(`all-or-nothing: 줄 ${last} — COMMIT; 이 아니다`);

  // 값은 베껴 쥔다 — 자료를 고치지 않는다.
  const first = new Map<string, number>();
  const values = new Map<string, number>();
  const id = (table: string, key: string): string => `${table}\u0000${key}`;
  for (const table of data.tables) {
    for (const row of table.rows) {
      first.set(id(table.name, row.key), row.value);
      values.set(id(table.name, row.key), row.value);
    }
  }
  const valueOf = (table: string, key: string): number => {
    const v = values.get(id(table, key));
    if (v === undefined) throw new Error(`all-or-nothing: 없는 줄 ${table}.${key}`);
    return v;
  };

  const updates: Update[] = [];
  for (let line = 1; line < last; line += 1) {
    if (ctx.cancelled) return;
    const text = body[line];
    if (text === undefined) throw new Error(`all-or-nothing: 줄 ${line} 이 비었다`);
    updates.push(parseUpdate(text, line, data.tables));
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const undo: { table: string; key: string; before: number; after: number }[] = [];
  let failed = false;

  for (const u of updates) {
    if (!(await pause())) return;
    const before = valueOf(u.table.name, u.key);
    const after = before + u.delta;
    if (!holds(u.table.check, after)) {
      const skipped: number[] = [];
      for (let line = u.line + 1; line <= last; line += 1) skipped.push(line);
      await ctx.emit({
        type: 'reject',
        payload: {
          line: u.line,
          table: u.table.name,
          key: u.key,
          before,
          attempted: after,
          entries: undo.length,
          skipped,
        },
      });
      failed = true;
      break;
    }
    undo.push({ table: u.table.name, key: u.key, before, after });
    values.set(id(u.table.name, u.key), after);
    await ctx.emit({
      type: 'write',
      payload: { line: u.line, table: u.table.name, key: u.key, before, after, entries: undo.length },
    });
  }

  if (!failed) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'commit', payload: { line: last, entries: undo.length } });
    return;
  }

  for (let slot = undo.length - 1; slot >= 0; slot -= 1) {
    if (!(await pause())) return;
    const entry = undo[slot];
    if (entry === undefined) throw new Error(`all-or-nothing: 되돌림 칸 ${slot + 1} 이 없다`);
    const from = valueOf(entry.table, entry.key);
    if (from !== entry.after) {
      throw new Error(`all-or-nothing: ${entry.table}.${entry.key} 의 지금 값이 기록과 다르다`);
    }
    values.set(id(entry.table, entry.key), entry.before);
    let restored = 0;
    for (const [k, v] of values) if (first.get(k) === v) restored += 1;
    await ctx.emit({
      type: 'undo',
      payload: {
        slot: slot + 1,
        table: entry.table,
        key: entry.key,
        from,
        to: entry.before,
        left: slot,
        restored,
        total: values.size,
      },
    });
  }
}
