/**
 * non-repeatable-read — 커밋된 것만 읽는데도 같은 줄이 두 값으로 읽힌다.
 *
 * 규약 (사양의 규약 줄을 옮김):
 *   - READ COMMITTED 읽기 = 읽는 순간 **확정된** 가장 최근 값. 커밋 안 된 쓰기는 안 보인다.
 *   - 읽기는 잠금을 커밋까지 쥐지 않는다 — 그래서 쓰기가 기다리지 않는다 (잠금은 모형에 두지 않는다).
 *   - 쓰기는 커밋 전까지 제 트랜잭션의 미확정 쓰기로만 남고, 커밋이 그것을 확정값으로 올린다.
 *   - 걸음: 처음 · 연산마다 하나. C1 은 두지 않는다 (차례에 없는 연산은 만들지 않는다).
 *
 * 이벤트 (모두 silent 아님 — 연산 하나가 걸음 하나):
 *   read    { txn: number; row: string; value: number; nth: number; first: number }
 *           txn 이 row 를 읽어 value 를 얻었다. nth 는 그 트랜잭션이 그 줄을 읽은 번째(1 부터),
 *           first 는 그 트랜잭션이 그 줄에서 처음 읽은 값 (nth 가 1 이면 value 와 같다).
 *   write   { txn: number; row: string; value: number; committed: number }
 *           txn 이 row 에 value 를 쓴다 (미확정). committed 는 그 순간 표의 확정값.
 *   commit  { txn: number; writes: { row: string; value: number; was: number }[] }
 *           txn 의 미확정 쓰기가 확정값이 된다. was 는 덮이기 전의 확정값.
 *
 * 던지는 자리 (C6): 모르는 연산 종류 · 없는 줄 · READ COMMITTED 가 아닌 격리 수준 · 같은 줄의 확정값이 둘 ·
 *   커밋된 트랜잭션의 새 연산.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NonRepeatableReadRow = { name: string; value: number };

export type NonRepeatableReadOp =
  | { op: 'R'; txn: number; row: string }
  | { op: 'W'; txn: number; row: string; value: number }
  | { op: 'C'; txn: number };

export type NonRepeatableReadFacetData = {
  type: 'non-repeatable-read';
  stepMs: number;
  /** 읽는 트랜잭션의 격리 수준 — 이 조각은 READ COMMITTED 만 셈한다 */
  isolation: string;
  rows: NonRepeatableReadRow[];
  ops: NonRepeatableReadOp[];
};

export const NON_REPEATABLE_READ_LEVEL = 'READ COMMITTED';

export async function nonRepeatableRead(
  baseCtx: FacetContext<NonRepeatableReadFacetData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<NonRepeatableReadFacetData>;
  const data = ctx.data;
  if (data.isolation !== NON_REPEATABLE_READ_LEVEL) {
    throw new Error(`non-repeatable-read: 셈할 수 없는 격리 수준 ${data.isolation}`);
  }
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 표의 확정값 — 줄 이름마다 하나
  const committed = new Map<string, number>();
  for (const r of data.rows) {
    if (committed.has(r.name)) {
      throw new Error(`non-repeatable-read: 줄 ${r.name} 의 확정값이 둘`);
    }
    committed.set(r.name, r.value);
  }
  const committedOf = (row: string): number => {
    const v = committed.get(row);
    if (v === undefined) throw new Error(`non-repeatable-read: 없는 줄 ${row}`);
    return v;
  };

  // 트랜잭션마다 미확정 쓰기 (쓴 차례를 지킨다)
  const pending = new Map<number, Map<string, number>>();
  // 트랜잭션마다 줄마다 읽은 값들
  const readsOf = new Map<string, number[]>();
  const done = new Set<number>();

  for (const op of data.ops) {
    // 걸음 0 은 이미 읽을 것이 있는 화면(처음 확정값)이라 첫 연산 앞에도 문을 둔다
    if (!(await pause())) return;
    if (done.has(op.txn)) {
      throw new Error(`non-repeatable-read: 커밋된 T${op.txn} 의 연산 ${op.op}`);
    }
    switch (op.op) {
      case 'R': {
        // READ COMMITTED — 읽는 순간의 확정값. 제 미확정 쓰기가 있으면 그것을 읽는다
        const own = pending.get(op.txn)?.get(op.row);
        const value = own !== undefined ? own : committedOf(op.row);
        const key = `${op.txn}:${op.row}`;
        const list = readsOf.get(key) ?? [];
        list.push(value);
        readsOf.set(key, list);
        const first = list[0];
        if (first === undefined) throw new Error('non-repeatable-read: 읽은 값 목록이 비었다');
        await ctx.emit({
          type: 'read',
          payload: { txn: op.txn, row: op.row, value, nth: list.length, first },
        });
        break;
      }
      case 'W': {
        const before = committedOf(op.row);
        const mine = pending.get(op.txn) ?? new Map<string, number>();
        mine.set(op.row, op.value);
        pending.set(op.txn, mine);
        await ctx.emit({
          type: 'write',
          payload: { txn: op.txn, row: op.row, value: op.value, committed: before },
        });
        break;
      }
      case 'C': {
        const mine = pending.get(op.txn) ?? new Map<string, number>();
        const writes: { row: string; value: number; was: number }[] = [];
        for (const [row, value] of mine) {
          if (ctx.cancelled) return;
          writes.push({ row, value, was: committedOf(row) });
          committed.set(row, value);
        }
        pending.delete(op.txn);
        done.add(op.txn);
        await ctx.emit({ type: 'commit', payload: { txn: op.txn, writes } });
        break;
      }
      default: {
        const unknown: { op?: unknown } = op;
        throw new Error(`non-repeatable-read: 모르는 연산 ${String(unknown.op)}`);
      }
    }
  }
}
