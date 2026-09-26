/**
 * dirty-read — 커밋 안 된 값을 읽으면 무엇이 잘못되는가.
 *
 * 줄 몇과 트랜잭션 몇, 그리고 한 줄로 선 연산 차례를 받아 연산을 하나씩 돌린다.
 * 한 걸음 = 연산 하나. 걸음 0 은 처음 상태로 장면의 `initial()` 이 세운다.
 *
 * 규약 (사양 그대로)
 * - READ UNCOMMITTED 읽기 = 커밋 여부와 상관없이 그 줄에 **가장 최근에 쓰인 값**.
 *   READ COMMITTED 읽기 = 그 줄의 확정값. 읽기는 잠금을 잡지 않는다.
 * - 쓰기는 확정값을 바꾸지 않는다. 커밋이 그 트랜잭션의 쓰기를 적힌 차례대로 확정값에 옮긴다.
 * - 되돌림(A) 은 그 트랜잭션의 쓰기를 버린다 — 확정값은 그대로다.
 * - 읽은 값은 읽은 트랜잭션의 것이다. 되돌림이 그것을 고치지 않는다.
 * - 모르는 연산 · 없는 줄 · 없는 트랜잭션 · 격리 수준이 없는 읽기 · 끝난 트랜잭션의 연산은 던진다 (C6).
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음)
 * - `write`  payload `{ txn: string; row: string; value: number; committed: RowValue[] }`
 * - `read`   payload `{ txn: string; row: string; value: number; source: string | null; committed: RowValue[] }`
 *            `source` 는 읽은 값을 쓰고 아직 커밋 안 한 트랜잭션, 확정값을 읽었으면 null
 * - `abort`  payload `{ txn: string; discarded: RowValue[]; committed: RowValue[] }`
 * - `commit` payload `{ txn: string; applied: RowValue[]; committed: RowValue[] }`
 *   `RowValue = { row: string; value: number }`, `committed` 는 그 연산 뒤의 확정값 전부 (줄 차례)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DirtyReadOp =
  | { op: 'W'; txn: string; row: string; value: number }
  | { op: 'R'; txn: string; row: string }
  | { op: 'A'; txn: string }
  | { op: 'C'; txn: string };

export type DirtyReadFacetData = {
  type: 'dirty-read';
  stepMs: number;
  /** 줄과 처음 확정값 */
  rows: { name: string; value: number }[];
  /** 트랜잭션. 읽는 트랜잭션만 격리 수준을 가진다 */
  txns: { name: string; level?: string }[];
  /** 한 줄로 선 실행 차례 */
  ops: DirtyReadOp[];
};

export type RowValue = { row: string; value: number };

type PendingWrite = { txn: string; row: string; value: number };

/** 확정값 · 커밋 안 된 쓰기 · 트랜잭션 상태를 쥐는 작은 엔진 */
function makeEngine(data: DirtyReadFacetData) {
  const committed = new Map<string, number>();
  for (const r of data.rows) committed.set(r.name, r.value);
  const levels = new Map<string, string | null>();
  const done = new Set<string>();
  for (const x of data.txns) levels.set(x.name, x.level ?? null);
  /** 커밋 안 된 쓰기, 쓰인 차례대로 */
  const pending: PendingWrite[] = [];

  function needRow(row: string, at: number): void {
    if (!committed.has(row)) throw new Error(`dirty-read: 연산 ${at} — 없는 줄 ${row}`);
  }
  function needLive(txn: string, at: number): void {
    if (!levels.has(txn)) throw new Error(`dirty-read: 연산 ${at} — 없는 트랜잭션 ${txn}`);
    if (done.has(txn)) throw new Error(`dirty-read: 연산 ${at} — 이미 끝난 트랜잭션 ${txn}`);
  }
  function snapshot(): RowValue[] {
    return data.rows.map((r) => {
      const v = committed.get(r.name);
      if (v === undefined) throw new Error(`dirty-read: 확정값 없는 줄 ${r.name}`);
      return { row: r.name, value: v };
    });
  }

  return {
    write(txn: string, row: string, value: number, at: number) {
      needLive(txn, at);
      needRow(row, at);
      pending.push({ txn, row, value });
      return snapshot();
    },
    read(txn: string, row: string, at: number): { value: number; source: string | null } {
      needLive(txn, at);
      needRow(row, at);
      const level = levels.get(txn);
      if (!level) throw new Error(`dirty-read: 연산 ${at} — ${txn} 에 격리 수준이 없다`);
      const base = committed.get(row);
      if (base === undefined) throw new Error(`dirty-read: 연산 ${at} — 확정값 없는 줄 ${row}`);
      if (level === 'READ COMMITTED') return { value: base, source: null };
      if (level === 'READ UNCOMMITTED') {
        // 가장 최근에 쓰인 값 — 커밋 안 된 쓰기 가운데 마지막 것, 없으면 확정값
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          const w = pending[i];
          if (w && w.row === row) return { value: w.value, source: w.txn };
        }
        return { value: base, source: null };
      }
      throw new Error(`dirty-read: 연산 ${at} — 모르는 격리 수준 ${level}`);
    },
    abort(txn: string, at: number): RowValue[] {
      needLive(txn, at);
      const discarded: RowValue[] = [];
      for (let i = 0; i < pending.length; ) {
        const w = pending[i];
        if (w && w.txn === txn) {
          discarded.push({ row: w.row, value: w.value });
          pending.splice(i, 1);
        } else i += 1;
      }
      done.add(txn);
      return discarded;
    },
    commit(txn: string, at: number): RowValue[] {
      needLive(txn, at);
      const applied: RowValue[] = [];
      for (let i = 0; i < pending.length; ) {
        const w = pending[i];
        if (w && w.txn === txn) {
          committed.set(w.row, w.value);
          applied.push({ row: w.row, value: w.value });
          pending.splice(i, 1);
        } else i += 1;
      }
      done.add(txn);
      return applied;
    },
    snapshot,
  };
}

export async function dirtyRead(context: FacetContext<DirtyReadFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DirtyReadFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const engine = makeEngine(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 이미 읽을 것이 있는 화면(처음 확정값)이다 — 첫 연산 앞에도 stepMs 를 둔다
  for (let at = 0; at < data.ops.length; at += 1) {
    if (!(await pause())) return;
    const o = data.ops[at];
    if (!o) throw new Error(`dirty-read: 연산 ${at} 이 비었다`);
    switch (o.op) {
      case 'W': {
        const committed = engine.write(o.txn, o.row, o.value, at);
        await ctx.emit({ type: 'write', payload: { txn: o.txn, row: o.row, value: o.value, committed } });
        break;
      }
      case 'R': {
        const got = engine.read(o.txn, o.row, at);
        await ctx.emit({
          type: 'read',
          payload: { txn: o.txn, row: o.row, value: got.value, source: got.source, committed: engine.snapshot() },
        });
        break;
      }
      case 'A': {
        const discarded = engine.abort(o.txn, at);
        await ctx.emit({ type: 'abort', payload: { txn: o.txn, discarded, committed: engine.snapshot() } });
        break;
      }
      case 'C': {
        const applied = engine.commit(o.txn, at);
        await ctx.emit({ type: 'commit', payload: { txn: o.txn, applied, committed: engine.snapshot() } });
        break;
      }
      default: {
        const unknown: never = o;
        throw new Error(`dirty-read: 연산 ${at} — 모르는 연산 ${JSON.stringify(unknown)}`);
      }
    }
  }
}
