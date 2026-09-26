/**
 * phantom-read — 읽은 줄을 모두 잠가도 같은 질의가 두 번째에 줄을 더 돌려준다.
 *
 * 1차 데이터는 표의 처음 줄과 SQL 문장의 차례(`schedule`)다. 알고리즘은 문장을
 * 작은 해석기로 읽어 차례대로 실행하고, 결과 · 잠금 · 새로 끼어든 줄을 셈한다.
 *
 * 규약 (사양 그대로)
 *   - 격리 수준은 REPEATABLE READ 하나만 안다. 뜻은 ANSI SQL-92 의 잠금 기반 정의 —
 *     질의가 돌려준 줄마다 S 잠금을 잡고 커밋까지 쥔다. **범위(조건)는 잠그지 않는다.**
 *   - INSERT 는 새 줄에 X 잠금을 잡고, 그 트랜잭션의 COMMIT 에서 놓는다.
 *   - 잠금 호환: S 와 S 만 함께 쥔다. 이 조각의 모형에는 기다림이 없다 — 막히는 요청이
 *     생기면 조용히 지나치지 않고 던진다.
 *   - 질의 결과는 id 오름차순. 두 SELECT 는 글자까지 같은 문장이어야 한다.
 *   - 한 걸음 = 문장 하나. 걸음 0 은 처음 표 (장면의 initial 이 채운다).
 *
 * 이벤트 (모두 silent 아님)
 *   query   { stmt: number, txn: string, ordinal: number,
 *             rows: [id: number, amount: number][],   결과, id 오름차순
 *             locked: number[],                      이번에 새로 S 잠금을 잡은 id
 *             kept: number[],                        앞 질의 결과에서 값까지 그대로 남은 id (첫 질의는 [])
 *             added: number[] }                      앞 질의 결과에 없던 id (첫 질의는 [])
 *   insert  { stmt: number, txn: string, id: number, amount: number, matches: boolean }
 *             matches — 새 줄이 질의 조건에 맞는가. X 잠금은 늘 기다림 없이 허락된 뒤에만 발신
 *   commit  { stmt: number, txn: string, released: number[] }   놓은 X 잠금의 id
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PhantomReadStatement = { txn: string; sql: string };

export type PhantomReadFacetData = {
  type: 'phantom-read';
  stepMs: number;
  table: string;
  columns: [string, string];
  rows: [number, number][];
  isolation: string;
  schedule: PhantomReadStatement[];
};

type Op = '>=' | '>' | '<=' | '<' | '=';
type Parsed =
  | { kind: 'select'; column: string; op: Op; value: number }
  | { kind: 'insert'; id: number; amount: number }
  | { kind: 'commit' };

const SELECT_RE = /^SELECT (\w+), (\w+) FROM (\w+) WHERE (\w+) (>=|<=|>|<|=) (-?\d+);$/;
const INSERT_RE = /^INSERT INTO (\w+) VALUES \((-?\d+), (-?\d+)\);$/;
const COMMIT_RE = /^COMMIT;$/;

function parse(sql: string, index: number, data: PhantomReadFacetData): Parsed {
  const where = `문장 ${index + 1}`;
  const sel = SELECT_RE.exec(sql);
  if (sel) {
    const [, c1, c2, table, col, op, value] = sel;
    if (table !== data.table) throw new Error(`${where}: 모르는 표 ${table}`);
    if (c1 !== data.columns[0] || c2 !== data.columns[1]) {
      throw new Error(`${where}: 열 ${c1}, ${c2} 는 표의 열과 다르다`);
    }
    if (col !== data.columns[1]) throw new Error(`${where}: 조건 열 ${col} 을 모른다`);
    return { kind: 'select', column: col, op: op as Op, value: Number(value) };
  }
  const ins = INSERT_RE.exec(sql);
  if (ins) {
    const [, table, id, amount] = ins;
    if (table !== data.table) throw new Error(`${where}: 모르는 표 ${table}`);
    return { kind: 'insert', id: Number(id), amount: Number(amount) };
  }
  if (COMMIT_RE.test(sql)) return { kind: 'commit' };
  throw new Error(`${where}: 모르는 문장 모양 — ${sql}`);
}

function test(amount: number, op: Op, value: number): boolean {
  switch (op) {
    case '>=': return amount >= value;
    case '>': return amount > value;
    case '<=': return amount <= value;
    case '<': return amount < value;
    case '=': return amount === value;
  }
}

/**
 * 줄 하나 단위의 잠금. S 와 S 만 함께 쥔다. 기다림은 모형에 없다 — 막히면 던진다.
 * 셈은 배열 메서드로만 한다 — 알고리즘의 루프는 걸음 루프 하나다 (C8).
 */
class Locks {
  private readonly held = new Map<number, Map<string, 'S' | 'X'>>();

  /** 새로 잡았으면 true, 이미 같은 이가 쥐고 있었으면 false. */
  take(id: number, txn: string, mode: 'S' | 'X', where: string): boolean {
    const h = this.held.get(id) ?? new Map<string, 'S' | 'X'>();
    this.held.set(id, h);
    const mine = h.get(txn);
    if (mine === mode || mine === 'X') return false;
    const blocker = [...h].find(([other, m]) => other !== txn && !(m === 'S' && mode === 'S'));
    if (blocker) {
      throw new Error(
        `${where}: ${txn} 의 ${mode} 요청이 ${blocker[0]} 의 ${blocker[1]} 에 막힌다 — 이 조각에는 기다림 모형이 없다`,
      );
    }
    h.set(txn, mode);
    return true;
  }

  releaseAll(txn: string, mode: 'S' | 'X'): number[] {
    const ids = [...this.held].filter(([, h]) => h.get(txn) === mode).map(([id]) => id);
    ids.forEach((id) => this.held.get(id)?.delete(txn));
    return ids.sort((a, b) => a - b);
  }
}

export async function phantomRead(context: FacetContext<PhantomReadFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PhantomReadFacetData>;
  const data = ctx.data;
  if (data.isolation !== 'REPEATABLE READ') {
    throw new Error(`격리 수준 ${data.isolation} 은 이 조각의 모형에 없다`);
  }
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const parsed = data.schedule.map((s, i) => parse(s.sql, i, data));
  const selects = data.schedule.filter((_, i) => parsed[i]!.kind === 'select').map((s) => s.sql);
  if (selects.length === 0) throw new Error('SELECT 가 하나도 없다');
  if (selects.some((s) => s !== selects[0])) throw new Error('두 질의가 같은 문장이 아니다');
  const firstSelect = parsed.find((p) => p.kind === 'select');
  if (!firstSelect || firstSelect.kind !== 'select') throw new Error('SELECT 가 하나도 없다');

  // 표: id → { amount, 넣은 이 (커밋 전이면) }
  const table = new Map<number, { amount: number; pendingBy: string | null }>();
  data.rows.forEach(([id, amount]) => {
    if (table.has(id)) throw new Error(`처음 표에 id ${id} 가 둘이다`);
    table.set(id, { amount, pendingBy: null });
  });
  const locks = new Locks();
  const lastResult = new Map<string, [number, number][]>();
  const ordinals = new Map<string, number>();

  // 걸음 0 은 이미 읽을 것이 있는 화면(처음 표)이라 첫 발신 앞에 틈을 둔다.
  for (let i = 0; i < data.schedule.length; i += 1) {
    if (!(await pause())) return;
    const stmt = data.schedule[i]!;
    const p = parsed[i]!;
    const where = `문장 ${i + 1}`;
    const txn = stmt.txn;

    if (p.kind === 'select') {
      const rows: [number, number][] = [...table]
        .sort((a, b) => a[0] - b[0])
        .filter(([, row]) => test(row.amount, p.op, p.value))
        .map(([id, row]) => [id, row.amount]);
      const locked = rows.map(([id]) => id).filter((id) => locks.take(id, txn, 'S', where));
      const prev = lastResult.get(txn);
      const kept = prev
        ? rows.filter(([id, amount]) => {
            const before = prev.find((r) => r[0] === id);
            if (before && before[1] !== amount) {
              throw new Error(`${where}: 줄 ${id} 의 값이 바뀌었다 — 이 조각의 모형 밖이다`);
            }
            return before !== undefined;
          }).map(([id]) => id)
        : [];
      const added = prev ? rows.map(([id]) => id).filter((id) => !kept.includes(id)) : [];
      lastResult.set(txn, rows);
      const ordinal = (ordinals.get(txn) ?? 0) + 1;
      ordinals.set(txn, ordinal);
      await ctx.emit({
        type: 'query',
        payload: { stmt: i, txn, ordinal, rows: rows.map((r) => [r[0], r[1]]), locked, kept, added },
      });
    } else if (p.kind === 'insert') {
      if (table.has(p.id)) throw new Error(`${where}: id ${p.id} 는 이미 있다`);
      locks.take(p.id, txn, 'X', where);
      table.set(p.id, { amount: p.amount, pendingBy: txn });
      const matches = test(p.amount, firstSelect.op, firstSelect.value);
      await ctx.emit({
        type: 'insert',
        payload: { stmt: i, txn, id: p.id, amount: p.amount, matches },
      });
    } else {
      table.forEach((row) => {
        if (row.pendingBy === txn) row.pendingBy = null;
      });
      const released = locks.releaseAll(txn, 'X');
      await ctx.emit({ type: 'commit', payload: { stmt: i, txn, released } });
    }
  }
}
