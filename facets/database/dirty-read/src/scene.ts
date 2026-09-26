/**
 * dirty-read 장면.
 *
 * 바탕 — 줄 이름 · 트랜잭션 이름 · 격리 수준 (initialData 에서 베낀다)
 * 자취 — 확정값과 그 내력 · 줄 위에 얹힌 커밋 안 된 쓰기 · 트랜잭션마다 상태 · 한 연산 · 쥔 읽은 값
 * 이번 걸음 — `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type TxnStatus = 'idle' | 'active' | 'aborted' | 'committed';

/** 트랜잭션이 한 연산. 표기(`W1(pen=0)`)는 그림이 만든다 */
export type DoneOp =
  | { op: 'W'; row: string; value: number }
  | { op: 'R'; row: string }
  | { op: 'A' }
  | { op: 'C' };

/** 읽어서 손에 쥔 값. source 는 그 값을 쓴 커밋 안 된 트랜잭션, 확정값이면 null */
export type HeldValue = { row: string; value: number; source: string | null };

export type SceneRow = { name: string; committed: number; history: number[] };
export type SceneTxn = { name: string; level: string | null; status: TxnStatus; ops: DoneOp[]; held: HeldValue[] };
export type PendingValue = { row: string; txn: string; value: number };

export type DirtyReadStep =
  | { kind: 'start' }
  | { kind: 'write'; txn: string; row: string; value: number }
  | { kind: 'read'; txn: string; row: string; value: number; source: string | null }
  | { kind: 'abort'; txn: string; discarded: { row: string; value: number }[] }
  | { kind: 'commit'; txn: string };

export type DirtyReadScene = {
  rows: SceneRow[];
  txns: SceneTxn[];
  pending: PendingValue[];
  step: DirtyReadStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`dirty-read 장면: ${what} 이 글자가 아니다`);
  return v;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dirty-read 장면: ${what} 이 수가 아니다`);
  return v;
}
function rowValues(v: unknown, what: string): { row: string; value: number }[] {
  if (!Array.isArray(v)) throw new Error(`dirty-read 장면: ${what} 이 목록이 아니다`);
  return v.map((x, i) => {
    if (!isRecord(x)) throw new Error(`dirty-read 장면: ${what}[${i}] 이 객체가 아니다`);
    return { row: str(x.row, `${what}[${i}].row`), value: num(x.value, `${what}[${i}].value`) };
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`dirty-read 장면: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

/** 연산 뒤 확정값을 줄에 옮기고, 값이 바뀌었으면 내력에 더한다 */
function withCommitted(rows: SceneRow[], committed: { row: string; value: number }[]): SceneRow[] {
  return rows.map((r) => {
    const c = committed.find((x) => x.row === r.name);
    if (!c) throw new Error(`dirty-read 장면: 확정값에 줄 ${r.name} 이 없다`);
    const last = r.history[r.history.length - 1];
    const history = last === c.value ? [...r.history] : [...r.history, c.value];
    return { name: r.name, committed: c.value, history };
  });
}

/** payload 가 버렸다 · 옮겼다고 말한 쓰기를 얹힌 것에서 하나씩 뗀다 — 장면은 다시 셈하지 않는다 */
function withoutWrites(pending: PendingValue[], txn: string, gone: { row: string; value: number }[]): PendingValue[] {
  const rest = [...pending];
  for (const g of gone) {
    const i = rest.findIndex((w) => w.txn === txn && w.row === g.row && w.value === g.value);
    if (i < 0) throw new Error(`dirty-read 장면: 얹힌 쓰기에 ${txn} 의 ${g.row}=${g.value} 이 없다`);
    rest.splice(i, 1);
  }
  return rest;
}

function mapTxn(txns: SceneTxn[], name: string, fn: (x: SceneTxn) => SceneTxn): SceneTxn[] {
  if (!txns.some((x) => x.name === name)) throw new Error(`dirty-read 장면: 없는 트랜잭션 ${name}`);
  return txns.map((x) => (x.name === name ? fn(x) : x));
}

export const dirtyReadScene: ScenePlan<DirtyReadScene> = {
  initial(initialData: unknown): DirtyReadScene {
    if (!isRecord(initialData)) throw new Error('dirty-read 장면: initialData 가 없다');
    const d = initialData;
    if (!Array.isArray(d.rows) || d.rows.length === 0) throw new Error('dirty-read 장면: rows 가 없다');
    if (!Array.isArray(d.txns) || d.txns.length === 0) throw new Error('dirty-read 장면: txns 가 없다');
    const rows: SceneRow[] = d.rows.map((r, i) => {
      if (!isRecord(r)) throw new Error(`dirty-read 장면: rows[${i}] 이 객체가 아니다`);
      const value = num(r.value, `rows[${i}].value`);
      return { name: str(r.name, `rows[${i}].name`), committed: value, history: [value] };
    });
    const txns: SceneTxn[] = d.txns.map((x, i) => {
      if (!isRecord(x)) throw new Error(`dirty-read 장면: txns[${i}] 이 객체가 아니다`);
      const level = x.level === undefined ? null : str(x.level, `txns[${i}].level`);
      return { name: str(x.name, `txns[${i}].name`), level, status: 'idle', ops: [], held: [] };
    });
    return { rows, txns, pending: [], step: { kind: 'start' } };
  },

  reduce(scene: DirtyReadScene, event: FacetRuntimeEvent): DirtyReadScene {
    if (event.type === 'write') {
      const p = payloadOf(event);
      const txn = str(p.txn, 'write.txn');
      const row = str(p.row, 'write.row');
      const value = num(p.value, 'write.value');
      return {
        rows: withCommitted(scene.rows, rowValues(p.committed, 'write.committed')),
        txns: mapTxn(scene.txns, txn, (x) => ({
          ...x,
          status: 'active',
          ops: [...x.ops, { op: 'W', row, value }],
        })),
        pending: [...scene.pending, { row, txn, value }],
        step: { kind: 'write', txn, row, value },
      };
    }
    if (event.type === 'read') {
      const p = payloadOf(event);
      const txn = str(p.txn, 'read.txn');
      const row = str(p.row, 'read.row');
      const value = num(p.value, 'read.value');
      const source = p.source === null ? null : str(p.source, 'read.source');
      return {
        rows: withCommitted(scene.rows, rowValues(p.committed, 'read.committed')),
        txns: mapTxn(scene.txns, txn, (x) => ({
          ...x,
          status: 'active',
          ops: [...x.ops, { op: 'R', row }],
          held: [...x.held, { row, value, source }],
        })),
        pending: [...scene.pending],
        step: { kind: 'read', txn, row, value, source },
      };
    }
    if (event.type === 'abort') {
      const p = payloadOf(event);
      const txn = str(p.txn, 'abort.txn');
      const discarded = rowValues(p.discarded, 'abort.discarded');
      return {
        rows: withCommitted(scene.rows, rowValues(p.committed, 'abort.committed')),
        txns: mapTxn(scene.txns, txn, (x) => ({ ...x, status: 'aborted', ops: [...x.ops, { op: 'A' }] })),
        pending: withoutWrites(scene.pending, txn, discarded),
        step: { kind: 'abort', txn, discarded },
      };
    }
    if (event.type === 'commit') {
      const p = payloadOf(event);
      const txn = str(p.txn, 'commit.txn');
      const applied = rowValues(p.applied, 'commit.applied');
      return {
        rows: withCommitted(scene.rows, rowValues(p.committed, 'commit.committed')),
        txns: mapTxn(scene.txns, txn, (x) => ({ ...x, status: 'committed', ops: [...x.ops, { op: 'C' }] })),
        pending: withoutWrites(scene.pending, txn, applied),
        step: { kind: 'commit', txn },
      };
    }
    throw new Error(`dirty-read 장면: 모르는 이벤트 ${event.type}`);
  },
};
