/**
 * 격리 수준과 잠금 — 연산 열셋짜리 한 일정을 네 격리 수준으로 돌린다. 수준을 올리면 이상(더티 · 반복 불가 ·
 * 팬텀)이 하나씩 꺼지고, 그 값은 남의 연산이 기다리며 실행 차례에서 뒤로 밀리는 것으로 치른다.
 *
 * ## 규약 (사양 그대로 옮김)
 *
 * - 잠금은 줄 하나 단위 (orders 는 id 마다 한 줄). 호환표 S–S 만 함께, S–X · X–S · X–X 막힘.
 * - 쓰기 · 넣기는 X 를 잡고 **커밋 · 되돌림까지** 쥔다 (네 수준 모두). 되돌림은 그 트랜잭션의 쓰기를 버린다.
 * - 읽기 · 질의
 *   - RU — 잠금 없음. 읽기는 그 줄에 **가장 최근에 쓰인 값**(커밋 여부 무관)
 *   - RC — 읽는 그 걸음에만 S (막히면 기다린다), 걸음이 끝나면 놓는다. 읽기는 확정값
 *   - RR — S 를 **커밋까지**. 질의는 결과 줄마다 S 를 커밋까지. 범위는 잠그지 않는다
 *   - SER — RR + 질의 조건(`amount >= 문턱`)의 **범위 잠금** 하나를 커밋까지. 남의 넣기 가운데 조건에 드는 것만 막는다
 * - 질의가 보는 줄은 표의 모든 줄(남이 넣고 아직 확정하지 않은 줄 포함) 가운데 조건에 드는 것이다. RU 는 잠금 없이
 *   그대로 보고, RC 이상은 그 줄마다 S 가 필요하다 — 남이 X 를 쥔 줄이 조건에 들면 막힌다.
 * - 차례 고르기 — 걸음마다, 적힌 차례에서 **그 트랜잭션의 앞 연산이 다 끝났고 막히지 않은 첫 연산** 하나를 실행한다.
 *   그보다 앞 차례인데 막혀 있는 연산이 그 걸음에 **기다리는** 연산이다. waited-steps = 걸음마다 기다리는 연산 수의 합.
 *   같은 트랜잭션의 뒷 연산은 앞 연산이 기다리는 동안 따라 기다리되 따로 세지 않는다.
 *   실행할 연산이 하나도 없는데 남은 연산이 있으면 교착 — 셈할 수 없는 상태로 던진다 (C6).
 * - 이상 셈 (관찰자 = `observer`, 이 일정에서 T1)
 *   - 더티 — 관찰자가 읽은 값을 쓴 트랜잭션이 되돌려졌다. 드러나는 걸음은 그 되돌림 걸음
 *   - 반복 불가 — 관찰자의 같은 줄 두 읽기 값이 다르다. 드러나는 걸음은 둘째 읽기
 *   - 팬텀 — 관찰자의 두 질의 id 모임이 다르다. 드러나는 걸음은 둘째 질의
 * - t1-peak-locks = 걸음이 끝난 뒤 관찰자가 쥔 잠금 수의 최고 (범위 잠금 하나를 1 로). RC 의 걸음 안 S 는 걸음이
 *   끝나면 놓였으므로 세지 않는다. 엄격한 2 단계라 쥔 수는 오르기만 하다가 커밋 걸음에 한꺼번에 0 이 된다.
 * - 동률 — 없다. 걸음마다 실행되는 연산은 적힌 차례의 첫 후보 하나다.
 *
 * ## 이벤트
 *
 * - `step` (silent 아님) — 한 판에 걸음 0(처음 모습)부터 걸음 N(연산 수)까지 N+1 번. payload:
 *   ```
 *   { step: number, level: number, levelName: string, observer: string, txs: string[],
 *     ops: { label: string, tx: string }[],               // 적힌 차례
 *     order: number[],                                    // 칸 차례 — 실행된 것(실행 차례) 뒤에 남은 것(적힌 차례)
 *     ran: number,                                        // 이 걸음에 실행된 연산 번호, 걸음 0 은 -1
 *     effects: ({ kind: 'read', value: number } | { kind: 'query', ids: number[] }
 *              | { kind: 'lock', mode: 'X', target: string } | { kind: 'commit' } | { kind: 'abort' } | null)[],   // 연산 번호별
 *     waiting: { op: number, blocker: string, mode: 'S' | 'X' | 'range', key: string, target: string }[],
 *     spans: { key: string, label: string, from: number, to: number, momentary: boolean }[],  // 관찰자의 잠금, to=-1 은 쥐는 중
 *     held: number,
 *     rows: { name: string, value: number, pendingTx: string | null, pendingValue: number,
 *             holders: { tx: string, mode: 'S' | 'X' }[] }[],
 *     table: { name: string, columns: string[], rows: { id: number, amount: number, pendingTx: string | null,
 *              inRange: boolean, holders: { tx: string, mode: 'S' | 'X' }[] }[] },
 *     sql: string, queryLabel: string | null,              // 질의 Q1 의 SQL (자료) 과 그 연산 표기
 *     rangeHolder: string | null, threshold: number,
 *     touched: string[],                                  // 이 걸음의 연산이 닿은 줄 (pen · orders:6 꼴)
 *     anomalies: { dirty: boolean, nonRepeatable: boolean, phantom: boolean },
 *     reads: { target: string, values: number[] }[], queries: number[][] }
 *   ```
 * - phase 이벤트는 없다 — IR 을 두지 않는다 (irs.ts). phase 어휘: 없음.
 *
 * ## 계기
 *
 * `anomalies` · `waited-steps` · `t1-peak-locks`. 판 안에서 드러나는 걸음에 오르고, 판을 새로 시작할 때 차이 헬퍼로
 * 0 으로 되돌린다. 첫 판에 셋 다 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IsolationOp = {
  tx: string;
  kind: string; // 'W' | 'R' | 'A' | 'C' | 'I' | 'Q'
  row?: string;
  value?: number;
  id?: number;
  amount?: number;
};

export type IsolationData = {
  type: 'isolation';
  stepMs: number;
  rows: { name: string; value: number }[];
  table: { name: string; columns: string[]; rows: { id: number; amount: number }[] };
  query: { sql: string; threshold: number };
  observer: string;
  ops: IsolationOp[];
  levelLadder: number[];
  level: number;
  levelNames: string[];
};

export type LockMode = 'S' | 'X';
export type Effect =
  | { kind: 'read'; value: number }
  | { kind: 'query'; ids: number[] }
  | { kind: 'lock'; mode: 'X'; target: string }
  | { kind: 'commit' }
  | { kind: 'abort' };
export type Waiting = { op: number; blocker: string; mode: LockMode | 'range'; key: string; target: string };
export type Span = { key: string; label: string; from: number; to: number; momentary: boolean };
export type Holder = { tx: string; mode: LockMode };

export type IsolationStep = {
  step: number;
  level: number;
  levelName: string;
  observer: string;
  txs: string[];
  ops: { label: string; tx: string }[];
  order: number[];
  ran: number;
  effects: (Effect | null)[];
  waiting: Waiting[];
  spans: Span[];
  held: number;
  rows: { name: string; value: number; pendingTx: string | null; pendingValue: number; holders: Holder[] }[];
  table: {
    name: string;
    columns: string[];
    rows: { id: number; amount: number; pendingTx: string | null; inRange: boolean; holders: Holder[] }[];
  };
  sql: string;
  queryLabel: string | null;
  rangeHolder: string | null;
  threshold: number;
  touched: string[];
  anomalies: { dirty: boolean; nonRepeatable: boolean; phantom: boolean };
  reads: { target: string; values: number[] }[];
  queries: number[][];
};

/** 판 하나의 셈 — 걸음마다의 모습과, 걸음 끝마다 누적된 계기 값. */
export type IsolationRun = {
  steps: IsolationStep[];
  metrics: { anomalies: number; waitedSteps: number; t1PeakLocks: number }[];
  execOrder: string[];
  dirty: number;
  nonRepeatable: number;
  phantom: number;
};

const LEVEL_RU = 0;
const LEVEL_RC = 1;
const LEVEL_RR = 2;
const LEVEL_SER = 3;

type Lock = { s: string[]; x: string | null };
type Blocked = { blocker: string; mode: LockMode | 'range'; key: string; target: string };

function txNumber(tx: string): string {
  const m = /^T(\d+)$/.exec(tx);
  if (!m) throw new Error(`[isolation] 연산 표기를 쓸 수 없는 트랜잭션 이름: ${tx}`);
  return m[1]!;
}

function need(v: number | string | undefined, what: string): number | string {
  if (v === undefined) throw new Error(`[isolation] 연산에 ${what} 가 없다`);
  return v;
}
function needNum(v: number | undefined, what: string): number {
  const x = need(v, what);
  if (typeof x !== 'number') throw new Error(`[isolation] ${what} 가 수가 아니다`);
  return x;
}
function needStr(v: string | undefined, what: string): string {
  const x = need(v, what);
  if (typeof x !== 'string') throw new Error(`[isolation] ${what} 가 글자가 아니다`);
  return x;
}

/** 연산 표기 — transaction 조각 공통 (`W3(pen=0)` · `R1(lamp)` · `A3` · `C1` · `I4(6, 130)` · `Q1`). */
export function opLabel(op: IsolationOp): string {
  const n = txNumber(op.tx);
  switch (op.kind) {
    case 'W':
      return `W${n}(${needStr(op.row, 'row')}=${needNum(op.value, 'value')})`;
    case 'R':
      return `R${n}(${needStr(op.row, 'row')})`;
    case 'A':
      return `A${n}`;
    case 'C':
      return `C${n}`;
    case 'I':
      return `I${n}(${needNum(op.id, 'id')}, ${needNum(op.amount, 'amount')})`;
    case 'Q':
      return `Q${n}`;
    default:
      throw new Error(`[isolation] 모르는 연산 종류: ${op.kind}`);
  }
}

const tableKey = (id: number): string => `orders:${id}`;

/** 한 수준으로 일정 하나를 끝까지 돌린다. 순수 함수 — 걸음 0 부터 걸음 N 까지의 모습을 모은다. */
export function simulateIsolation(data: IsolationData, level: number): IsolationRun {
  if (!data.levelLadder.includes(level)) throw new Error(`[isolation] 사다리에 없는 수준: ${level}`);
  const levelName = data.levelNames[level];
  if (levelName === undefined) throw new Error(`[isolation] 수준 ${level} 의 이름이 없다`);
  const observer = data.observer;
  const threshold = data.query.threshold;
  const ops = data.ops;
  const labels = ops.map((op) => ({ label: opLabel(op), tx: op.tx }));
  const firstQuery = ops.findIndex((op) => op.kind === 'Q');
  const queryLabel = firstQuery < 0 ? null : labels[firstQuery]!.label;
  const txs: string[] = [];
  for (const op of ops) if (!txs.includes(op.tx)) txs.push(op.tx);

  // 저장 상태
  const committed = new Map<string, number>();
  for (const r of data.rows) committed.set(r.name, r.value);
  const pending = new Map<string, { tx: string; value: number }>();
  const table: { id: number; amount: number; pendingTx: string | null }[] = data.table.rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    pendingTx: null,
  }));
  const locks = new Map<string, Lock>();
  let rangeHolder: string | null = null;
  const lockOf = (key: string): Lock => {
    let l = locks.get(key);
    if (!l) {
      l = { s: [], x: null };
      locks.set(key, l);
    }
    return l;
  };
  const targetOf = (key: string): string =>
    key.startsWith('orders:') ? `${data.table.name} ${key.slice('orders:'.length)}` : key;

  // 관찰자 기록
  const readFrom: { row: string; writer: string }[] = []; // 관찰자가 읽은 미확정 값의 주인
  const reads: { target: string; values: number[] }[] = [];
  const queries: number[][] = [];
  const spans: Span[] = [];
  const anomalies = { dirty: false, nonRepeatable: false, phantom: false };
  let dirtyN = 0;
  let nonRepN = 0;
  let phantomN = 0;

  const done: boolean[] = ops.map(() => false);
  const effects: (Effect | null)[] = ops.map(() => null);
  const execOrder: number[] = [];

  /** 모자라는 잠금을 찾는다 — 없으면 null. */
  const blockS = (key: string, tx: string): Blocked | null => {
    const l = locks.get(key);
    if (l && l.x !== null && l.x !== tx) return { blocker: l.x, mode: 'X', key, target: targetOf(key) };
    return null;
  };
  const blockX = (key: string, tx: string): Blocked | null => {
    const l = locks.get(key);
    if (!l) return null;
    if (l.x !== null && l.x !== tx) return { blocker: l.x, mode: 'X', key, target: targetOf(key) };
    const other = l.s.find((h) => h !== tx);
    if (other !== undefined) return { blocker: other, mode: 'S', key, target: targetOf(key) };
    return null;
  };
  const matching = (): { id: number; amount: number; pendingTx: string | null }[] =>
    table.filter((r) => r.amount >= threshold);

  const blockedOf = (op: IsolationOp): Blocked | null => {
    switch (op.kind) {
      case 'W':
        return blockX(needStr(op.row, 'row'), op.tx);
      case 'I': {
        const id = needNum(op.id, 'id');
        const amount = needNum(op.amount, 'amount');
        if (table.some((r) => r.id === id)) throw new Error(`[isolation] 이미 있는 줄에 넣기: ${id}`);
        if (rangeHolder !== null && rangeHolder !== op.tx && amount >= threshold) {
          return { blocker: rangeHolder, mode: 'range', key: 'range', target: data.table.name };
        }
        return blockX(tableKey(id), op.tx);
      }
      case 'R': {
        if (level === LEVEL_RU) return null;
        const row = needStr(op.row, 'row');
        if (!committed.has(row)) throw new Error(`[isolation] 없는 줄: ${row}`);
        return blockS(row, op.tx);
      }
      case 'Q': {
        if (level === LEVEL_RU) return null;
        for (const r of matching()) {
          const b = blockS(tableKey(r.id), op.tx);
          if (b) return b;
        }
        return null;
      }
      case 'A':
      case 'C':
        return null;
      default:
        throw new Error(`[isolation] 모르는 연산 종류: ${op.kind}`);
    }
  };

  const openSpan = (key: string, label: string, step: number, momentary: boolean): void => {
    if (spans.some((s) => s.key === key && s.to === -1)) return; // 이미 쥐고 있다
    spans.push({ key, label, from: step, to: momentary ? step : -1, momentary });
  };
  const takeS = (key: string, tx: string, step: number, holdToEnd: boolean): void => {
    if (tx === observer) {
      openSpan(key, key.startsWith('orders:') ? key.slice('orders:'.length) : key, step, !holdToEnd);
    }
    if (!holdToEnd) return; // RC — 그 걸음 안에서 놓는다
    const l = lockOf(key);
    if (!l.s.includes(tx)) l.s.push(tx);
  };
  const takeX = (key: string, tx: string, step: number): void => {
    const l = lockOf(key);
    l.x = tx;
    l.s = l.s.filter((h) => h !== tx);
    if (tx === observer) openSpan(key, key.startsWith('orders:') ? key.slice('orders:'.length) : key, step, false);
  };
  const releaseAll = (tx: string, step: number): void => {
    for (const l of locks.values()) {
      if (l.x === tx) l.x = null;
      l.s = l.s.filter((h) => h !== tx);
    }
    if (rangeHolder === tx) rangeHolder = null;
    if (tx === observer) for (const s of spans) if (s.to === -1) s.to = step;
  };
  const heldBy = (tx: string): number => {
    let n = 0;
    for (const l of locks.values()) if (l.x === tx || l.s.includes(tx)) n += 1;
    if (rangeHolder === tx) n += 1;
    return n;
  };
  const recordRead = (target: string, value: number): { prev: number[] } => {
    let entry = reads.find((r) => r.target === target);
    if (!entry) {
      entry = { target, values: [] };
      reads.push(entry);
    }
    const prev = [...entry.values];
    entry.values.push(value);
    return { prev };
  };

  const execute = (i: number, step: number): { touched: string[]; anomaly: number } => {
    const op = ops[i]!;
    const tx = op.tx;
    let anomaly = 0;
    switch (op.kind) {
      case 'W': {
        const row = needStr(op.row, 'row');
        if (!committed.has(row)) throw new Error(`[isolation] 없는 줄: ${row}`);
        takeX(row, tx, step);
        pending.set(row, { tx, value: needNum(op.value, 'value') });
        effects[i] = { kind: 'lock', mode: 'X', target: targetOf(row) };
        return { touched: [row], anomaly };
      }
      case 'I': {
        const id = needNum(op.id, 'id');
        takeX(tableKey(id), tx, step);
        table.push({ id, amount: needNum(op.amount, 'amount'), pendingTx: tx });
        effects[i] = { kind: 'lock', mode: 'X', target: targetOf(tableKey(id)) };
        return { touched: [tableKey(id)], anomaly };
      }
      case 'R': {
        const row = needStr(op.row, 'row');
        const base = committed.get(row);
        if (base === undefined) throw new Error(`[isolation] 없는 줄: ${row}`);
        const p = pending.get(row);
        let value = base;
        if (p && (level === LEVEL_RU || p.tx === tx)) {
          value = p.value;
          if (tx === observer && p.tx !== tx) readFrom.push({ row, writer: p.tx });
        }
        if (level !== LEVEL_RU) takeS(row, tx, step, level >= LEVEL_RR);
        effects[i] = { kind: 'read', value };
        if (tx === observer) {
          const { prev } = recordRead(row, value);
          if (prev.length > 0 && prev.some((v) => v !== value) && !anomalies.nonRepeatable) {
            anomalies.nonRepeatable = true;
            nonRepN += 1;
            anomaly += 1;
          }
        }
        return { touched: [row], anomaly };
      }
      case 'Q': {
        const rowsSeen = matching()
          .filter((r) => level === LEVEL_RU || r.pendingTx === null || r.pendingTx === tx)
          .sort((a, b) => a.id - b.id);
        if (level !== LEVEL_RU) for (const r of rowsSeen) takeS(tableKey(r.id), tx, step, level >= LEVEL_RR);
        if (level === LEVEL_SER) {
          rangeHolder = tx;
          if (tx === observer) openSpan('range', `≥${threshold}`, step, false);
        }
        const ids = rowsSeen.map((r) => r.id);
        effects[i] = { kind: 'query', ids };
        if (tx === observer) {
          const before = queries.length > 0 ? queries[queries.length - 1]! : null;
          queries.push(ids);
          if (before !== null && before.join(',') !== ids.join(',') && !anomalies.phantom) {
            anomalies.phantom = true;
            phantomN += 1;
            anomaly += 1;
          }
        }
        return { touched: rowsSeen.map((r) => tableKey(r.id)), anomaly };
      }
      case 'C': {
        const touched: string[] = [];
        for (const [row, p] of [...pending]) {
          if (p.tx !== tx) continue;
          committed.set(row, p.value);
          pending.delete(row);
          touched.push(row);
        }
        for (const r of table) {
          if (r.pendingTx !== tx) continue;
          r.pendingTx = null;
          touched.push(tableKey(r.id));
        }
        releaseAll(tx, step);
        effects[i] = { kind: 'commit' };
        return { touched, anomaly };
      }
      case 'A': {
        const touched: string[] = [];
        for (const [row, p] of [...pending]) {
          if (p.tx !== tx) continue;
          pending.delete(row);
          touched.push(row);
        }
        for (let k = table.length - 1; k >= 0; k -= 1) {
          const r = table[k]!;
          if (r.pendingTx !== tx) continue;
          touched.push(tableKey(r.id));
          table.splice(k, 1);
        }
        releaseAll(tx, step);
        if (readFrom.some((r) => r.writer === tx) && !anomalies.dirty) {
          anomalies.dirty = true;
          dirtyN += 1;
          anomaly += 1;
        }
        effects[i] = { kind: 'abort' };
        return { touched, anomaly };
      }
      default:
        throw new Error(`[isolation] 모르는 연산 종류: ${op.kind}`);
    }
  };

  const holdersOf = (key: string): Holder[] => {
    const l = locks.get(key);
    if (!l) return [];
    const out: Holder[] = l.s.map((tx) => ({ tx, mode: 'S' as const }));
    if (l.x !== null) out.push({ tx: l.x, mode: 'X' });
    return out;
  };

  const snapshot = (step: number, ran: number, waiting: Waiting[], touched: string[]): IsolationStep => {
    const rest: number[] = [];
    for (let i = 0; i < ops.length; i += 1) if (!done[i]) rest.push(i);
    return {
      step,
      level,
      levelName,
      observer,
      txs: [...txs],
      ops: labels.map((l) => ({ ...l })),
      order: [...execOrder, ...rest],
      ran,
      effects: effects.map((e) => (e === null ? null : e.kind === 'query' ? { kind: 'query', ids: [...e.ids] } : { ...e })),
      waiting: waiting.map((w) => ({ ...w })),
      spans: spans.map((s) => ({ ...s })),
      held: heldBy(observer),
      rows: data.rows.map((r) => {
        const base = committed.get(r.name);
        if (base === undefined) throw new Error(`[isolation] 없는 줄: ${r.name}`);
        const p = pending.get(r.name);
        return {
          name: r.name,
          value: base,
          pendingTx: p ? p.tx : null,
          pendingValue: p ? p.value : base,
          holders: holdersOf(r.name),
        };
      }),
      table: {
        name: data.table.name,
        columns: [...data.table.columns],
        rows: [...table]
          .sort((a, b) => a.id - b.id)
          .map((r) => ({
            id: r.id,
            amount: r.amount,
            pendingTx: r.pendingTx,
            inRange: r.amount >= threshold,
            holders: holdersOf(tableKey(r.id)),
          })),
      },
      sql: data.query.sql,
      queryLabel,
      rangeHolder,
      threshold,
      touched: [...touched],
      anomalies: { ...anomalies },
      reads: reads.map((r) => ({ target: r.target, values: [...r.values] })),
      queries: queries.map((q) => [...q]),
    };
  };

  const steps: IsolationStep[] = [snapshot(0, -1, [], [])];
  const metrics: IsolationRun['metrics'] = [{ anomalies: 0, waitedSteps: 0, t1PeakLocks: 0 }];
  let anomalyTotal = 0;
  let waitedTotal = 0;
  let peak = 0;

  for (let step = 1; step <= ops.length; step += 1) {
    const waiting: Waiting[] = [];
    const busyTx = new Set<string>(); // 앞 연산이 아직 끝나지 않은 트랜잭션
    let chosen = -1;
    for (let i = 0; i < ops.length; i += 1) {
      if (done[i]) continue;
      const op = ops[i]!;
      if (busyTx.has(op.tx)) continue; // 같은 트랜잭션의 뒷 연산 — 따라 기다린다 (세지 않는다)
      busyTx.add(op.tx);
      const b = blockedOf(op);
      if (b) {
        waiting.push({ op: i, blocker: b.blocker, mode: b.mode, key: b.key, target: b.target });
        continue;
      }
      chosen = i;
      break;
    }
    if (chosen < 0) throw new Error(`[isolation] 걸음 ${step} 에 실행할 연산이 없다 — 교착`);
    const { touched, anomaly } = execute(chosen, step);
    done[chosen] = true;
    execOrder.push(chosen);
    anomalyTotal += anomaly;
    waitedTotal += waiting.length;
    peak = Math.max(peak, heldBy(observer));
    steps.push(snapshot(step, chosen, waiting, touched));
    metrics.push({ anomalies: anomalyTotal, waitedSteps: waitedTotal, t1PeakLocks: peak });
  }

  return {
    steps,
    metrics,
    execOrder: execOrder.map((i) => labels[i]!.label),
    dirty: dirtyN,
    nonRepeatable: nonRepN,
    phantom: phantomN,
  };
}

function checkData(data: IsolationData): void {
  if (data.type !== 'isolation') throw new Error('[isolation] initialData.type 이 isolation 이 아니다');
  if (!Array.isArray(data.ops) || data.ops.length === 0) throw new Error('[isolation] 연산 차례가 없다');
  if (!Array.isArray(data.levelLadder) || data.levelLadder.length === 0) throw new Error('[isolation] 수준 사다리가 없다');
  if (data.levelNames.length !== data.levelLadder.length) throw new Error('[isolation] 수준 이름 수가 사다리와 다르다');
  if (!data.levelLadder.includes(data.level)) throw new Error(`[isolation] 기본 수준이 사다리에 없다: ${data.level}`);
  for (const lv of data.levelLadder) {
    if (lv !== LEVEL_RU && lv !== LEVEL_RC && lv !== LEVEL_RR && lv !== LEVEL_SER) {
      throw new Error(`[isolation] 모르는 수준: ${lv}`);
    }
  }
}

export async function isolationAlgorithm(ctx: FacetContext<IsolationData>): Promise<void> {
  const rctx = ctx as ReactiveContext<IsolationData>;
  const data = ctx.data;
  checkData(data);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 첫 판에는 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const showMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined) {
      ctx.metric(name, value);
    } else if (value !== prev) {
      ctx.metric(name, value - prev);
    }
    shown.set(name, value);
  };

  const nextLevel = async (): Promise<number | null> => {
    for (;;) {
      if (rctx.cancelled) return null;
      const input = await rctx.waitForInput();
      if (rctx.cancelled) return null;
      if (input.type !== 'level') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) continue;
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number' || !data.levelLadder.includes(value)) continue;
      return value;
    }
  };

  let level = data.level;
  try {
    for (;;) {
      if (rctx.cancelled) return;
      const run = simulateIsolation(data, level);
      for (let s = 0; s < run.steps.length; s += 1) {
        if (rctx.cancelled) return;
        const m = run.metrics[s]!;
        await ctx.emit({ type: 'step', payload: run.steps[s]! });
        showMetric('anomalies', m.anomalies);
        showMetric('waited-steps', m.waitedSteps);
        showMetric('t1-peak-locks', m.t1PeakLocks);
        if (!(await rctx.sleep(data.stepMs))) return;
      }
      const next = await nextLevel();
      if (next === null) return;
      level = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
