/**
 * durable-after-commit 의 장면.
 *
 * 바탕: 줄 차례(`rows`) · 트랜잭션 차례(`txns`) · 기록 칸 수(`slots`) — initialData 에서 한 번 정한다.
 * 자취: 데이터 파일 · 버퍼 풀 · 로그 버퍼 · 로그 파일 · OK 를 받은 트랜잭션 · 충돌이 났는가.
 * 이번 걸음: `step` — 무엇이 어디로 옮겨 갔는지와 그 계기값.
 *
 * 셈(옛 값 · LSN · 다시 할 기록 고르기)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { LogRecord } from './algorithm.js';

export type DurableStep =
  | { kind: 'start' }
  | { kind: 'write'; lsn: number; txn: string; key: string; after: number }
  | { kind: 'commit'; lsn: number; txn: string }
  | { kind: 'flush'; lsns: number[] }
  | { kind: 'ok'; txn: string }
  | {
      kind: 'crash';
      lostPool: { key: string; value: number }[];
      lostRecords: LogRecord[];
      keptLsns: number[];
    }
  | {
      kind: 'redo';
      applied: { lsn: number; key: string; after: number }[];
      okTxns: string[];
      notOkTxns: string[];
    };

export type DurableScene = {
  rows: string[];
  txns: string[];
  slots: number;
  dataFile: number[];
  pool: (number | null)[];
  logBuf: LogRecord[];
  logFile: LogRecord[];
  okTxns: string[];
  crashed: boolean;
  step: DurableStep;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(o: Record<string, unknown>, f: string, where: string): number {
  const v = o[f];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`durable-after-commit ${where}: ${f} 는 수여야 한다`);
  return v;
}

function str(o: Record<string, unknown>, f: string, where: string): string {
  const v = o[f];
  if (typeof v !== 'string') throw new Error(`durable-after-commit ${where}: ${f} 는 글자여야 한다`);
  return v;
}

function nums(o: Record<string, unknown>, f: string, where: string): number[] {
  const v = o[f];
  if (!Array.isArray(v)) throw new Error(`durable-after-commit ${where}: ${f} 는 목록이어야 한다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`durable-after-commit ${where}: ${f} 의 칸이 수가 아니다`);
    return x;
  });
}

function strs(o: Record<string, unknown>, f: string, where: string): string[] {
  const v = o[f];
  if (!Array.isArray(v)) throw new Error(`durable-after-commit ${where}: ${f} 는 목록이어야 한다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`durable-after-commit ${where}: ${f} 의 칸이 글자가 아니다`);
    return x;
  });
}

function objs(o: Record<string, unknown>, f: string, where: string): Record<string, unknown>[] {
  const v = o[f];
  if (!Array.isArray(v)) throw new Error(`durable-after-commit ${where}: ${f} 는 목록이어야 한다`);
  return v.map((x) => {
    if (!isObj(x)) throw new Error(`durable-after-commit ${where}: ${f} 의 칸이 객체가 아니다`);
    return x;
  });
}

function toRecord(o: Record<string, unknown>, where: string): LogRecord {
  const kind = str(o, 'kind', where);
  const lsn = num(o, 'lsn', where);
  const txn = str(o, 'txn', where);
  if (kind === 'commit') return { lsn, txn, kind };
  if (kind === 'update') {
    return { lsn, txn, kind, key: str(o, 'key', where), before: num(o, 'before', where), after: num(o, 'after', where) };
  }
  throw new Error(`durable-after-commit ${where}: 모르는 기록 종류 ${kind}`);
}

function rowIndex(rows: string[], key: string, where: string): number {
  const i = rows.indexOf(key);
  if (i < 0) throw new Error(`durable-after-commit ${where}: 없는 줄 ${key}`);
  return i;
}

/** initialData 의 바탕 — 줄과 값, 트랜잭션 차례, 기록 칸 수. */
function readBase(initialData: unknown): {
  rows: string[];
  values: number[];
  txns: string[];
  slots: number;
} {
  if (!isObj(initialData)) throw new Error('durable-after-commit initialData: 객체가 아니다');
  const rowsRaw = initialData.rows;
  const eventsRaw = initialData.events;
  if (!Array.isArray(rowsRaw) || !Array.isArray(eventsRaw)) {
    throw new Error('durable-after-commit initialData: rows · events 는 목록이어야 한다');
  }
  const rows: string[] = [];
  const values: number[] = [];
  for (const r of rowsRaw) {
    if (!isObj(r)) throw new Error('durable-after-commit initialData: rows 의 칸이 객체가 아니다');
    rows.push(str(r, 'key', 'rows'));
    values.push(num(r, 'value', 'rows'));
  }
  const txns: string[] = [];
  let slots = 0;
  for (const e of eventsRaw) {
    if (!isObj(e)) throw new Error('durable-after-commit initialData: events 의 칸이 객체가 아니다');
    const op = str(e, 'op', 'events');
    if (op === 'write' || op === 'commit') {
      const txn = str(e, 'txn', 'events');
      if (!txns.includes(txn)) txns.push(txn);
      slots += 1;
    } else if (op !== 'crash' && op !== 'restart') {
      throw new Error(`durable-after-commit initialData: 모르는 사건 ${op}`);
    }
  }
  return { rows, values, txns, slots };
}

export const durableAfterCommitScene: ScenePlan<DurableScene> = {
  initial(initialData: unknown): DurableScene {
    const base = readBase(initialData);
    return {
      rows: [...base.rows],
      txns: [...base.txns],
      slots: base.slots,
      dataFile: [...base.values],
      pool: base.rows.map(() => null),
      logBuf: [],
      logFile: [],
      okTxns: [],
      crashed: false,
      step: { kind: 'start' },
    };
  },

  reduce(scene: DurableScene, event: FacetRuntimeEvent): DurableScene {
    const p = event.payload;
    const where = event.type;
    if (!isObj(p)) throw new Error(`durable-after-commit ${where}: payload 가 없다`);
    if (event.type === 'write') {
      const lsn = num(p, 'lsn', where);
      const txn = str(p, 'txn', where);
      const key = str(p, 'key', where);
      const before = num(p, 'before', where);
      const after = num(p, 'after', where);
      const i = rowIndex(scene.rows, key, where);
      const pool = [...scene.pool];
      pool[i] = after;
      return {
        ...scene,
        pool,
        logBuf: [...scene.logBuf, { lsn, txn, kind: 'update', key, before, after }],
        step: { kind: 'write', lsn, txn, key, after },
      };
    }
    if (event.type === 'commit-record') {
      const lsn = num(p, 'lsn', where);
      const txn = str(p, 'txn', where);
      return {
        ...scene,
        logBuf: [...scene.logBuf, { lsn, txn, kind: 'commit' }],
        step: { kind: 'commit', lsn, txn },
      };
    }
    if (event.type === 'flush') {
      const lsns = nums(p, 'lsns', where);
      const moved = lsns.map((l) => {
        const r = scene.logBuf.find((b) => b.lsn === l);
        if (!r) throw new Error(`durable-after-commit flush: 로그 버퍼에 없는 LSN ${l}`);
        return r;
      });
      return {
        ...scene,
        logBuf: scene.logBuf.filter((b) => !lsns.includes(b.lsn)),
        logFile: [...scene.logFile, ...moved],
        step: { kind: 'flush', lsns },
      };
    }
    if (event.type === 'ok') {
      const txn = str(p, 'txn', where);
      return { ...scene, okTxns: [...scene.okTxns, txn], step: { kind: 'ok', txn } };
    }
    if (event.type === 'crash') {
      const lostPool = objs(p, 'lostPool', where).map((o) => ({ key: str(o, 'key', where), value: num(o, 'value', where) }));
      const lostRecords = objs(p, 'lostRecords', where).map((o) => toRecord(o, where));
      const keptLsns = nums(p, 'keptLsns', where);
      return {
        ...scene,
        pool: scene.rows.map(() => null),
        logBuf: [],
        crashed: true,
        step: { kind: 'crash', lostPool, lostRecords, keptLsns },
      };
    }
    if (event.type === 'redo') {
      const applied = objs(p, 'applied', where).map((o) => ({
        lsn: num(o, 'lsn', where),
        key: str(o, 'key', where),
        after: num(o, 'after', where),
      }));
      const dataFile = [...scene.dataFile];
      for (const a of applied) dataFile[rowIndex(scene.rows, a.key, where)] = a.after;
      return {
        ...scene,
        dataFile,
        step: { kind: 'redo', applied, okTxns: strs(p, 'okTxns', where), notOkTxns: strs(p, 'notOkTxns', where) },
      };
    }
    throw new Error(`durable-after-commit: 모르는 이벤트 ${event.type}`);
  },
};
