/**
 * durable-after-commit — 커밋 기록이 디스크의 로그 파일에 내려앉은 뒤에야 OK 가 돌아간다.
 *
 * 모형 (먼저 적는 로그 · WAL):
 *   - 디스크: 데이터 파일(줄 → 값) · 로그 파일(기록 목록). 메모리: 버퍼 풀(줄 → 값) · 로그 버퍼(기록 목록).
 *   - 로그 기록은 LSN 1 부터 하나씩 붙는다.
 *   - 쓰기 = 로그 버퍼에 `<Tn, 줄, 옛 값, 새 값>` 한 칸 + 버퍼 풀의 그 줄을 새 값으로.
 *     옛 값은 버퍼 풀에 있으면 그 값, 없으면 데이터 파일의 값. 데이터 파일은 건드리지 않는다.
 *     버퍼 풀의 페이지는 이 장면 안에서 데이터 파일로 내려가지 않는다 (체크포인트 · 페이지 내보내기 없음).
 *   - 커밋 = 세 걸음: ① 로그 버퍼에 `<Tn, commit>` ② 로그 버퍼 **전부**를 로그 파일로 ③ OK 를 돌려준다.
 *   - 충돌 = 메모리(버퍼 풀 · 로그 버퍼)가 통째로 사라진다. 디스크는 남는다.
 *   - 다시 켜기 = 로그 파일을 LSN 차례로 읽어, 로그 파일에 commit 기록이 있는 트랜잭션의 쓰기만
 *     새 값으로 데이터 파일에 쓴다 (다시 하기). 되돌리기는 없다.
 *
 * 이벤트 (모두 silent 아님 — 한 발신이 한 걸음):
 *   write          { lsn: number, txn: string, key: string, before: number, after: number }
 *   commit-record  { lsn: number, txn: string }
 *   flush          { lsns: number[] }                     — 로그 버퍼에서 로그 파일로 내린 LSN, 차례대로
 *   ok             { txn: string }
 *   crash          { lostPool: { key: string, value: number }[],
 *                    lostRecords: LogRecord[], keptLsns: number[] }
 *   redo           { applied: { lsn: number, key: string, after: number }[],
 *                    okTxns: string[], notOkTxns: string[] }  — 뒤 둘은 OK 를 받은 · 못 받은 쓴 트랜잭션
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 데이터 파일로 세운다. 그 화면에 읽을 것이 있어 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RowSpec = { key: string; value: number };

export type TxnEvent =
  | { op: 'write'; txn: string; key: string; value: number }
  | { op: 'commit'; txn: string }
  | { op: 'crash' }
  | { op: 'restart' };

export type DurableAfterCommitFacetData = {
  type: 'durable-after-commit';
  stepMs: number;
  rows: RowSpec[];
  events: TxnEvent[];
};

export type LogRecord =
  | { lsn: number; txn: string; kind: 'update'; key: string; before: number; after: number }
  | { lsn: number; txn: string; kind: 'commit' };

export async function durableAfterCommit(
  context: FacetContext<DurableAfterCommitFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DurableAfterCommitFacetData>;
  const { stepMs, rows, events } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const dataFile = new Map<string, number>();
  for (const row of rows) {
    if (ctx.cancelled) return;
    if (dataFile.has(row.key)) throw new Error(`durable-after-commit: 줄 ${row.key} 이 두 번 적혔다`);
    dataFile.set(row.key, row.value);
  }
  const pool = new Map<string, number>();
  let logBuf: LogRecord[] = [];
  const logFile: LogRecord[] = [];
  const oked: string[] = [];
  const writers: string[] = [];
  let lsn = 0;

  for (const ev of events) {
    if (!(await pause())) return;
    if (ev.op === 'write') {
      const onDisk = dataFile.get(ev.key);
      if (onDisk === undefined) throw new Error(`durable-after-commit: 없는 줄 ${ev.key}`);
      const inPool = pool.get(ev.key);
      const before = inPool === undefined ? onDisk : inPool;
      lsn += 1;
      logBuf.push({ lsn, txn: ev.txn, kind: 'update', key: ev.key, before, after: ev.value });
      pool.set(ev.key, ev.value);
      if (!writers.includes(ev.txn)) writers.push(ev.txn);
      await ctx.emit({
        type: 'write',
        payload: { lsn, txn: ev.txn, key: ev.key, before, after: ev.value },
      });
    } else if (ev.op === 'commit') {
      lsn += 1;
      logBuf.push({ lsn, txn: ev.txn, kind: 'commit' });
      await ctx.emit({ type: 'commit-record', payload: { lsn, txn: ev.txn } });
      if (!(await pause())) return;
      const lsns = logBuf.map((r) => r.lsn);
      logFile.push(...logBuf);
      logBuf = [];
      await ctx.emit({ type: 'flush', payload: { lsns } });
      if (!(await pause())) return;
      oked.push(ev.txn);
      await ctx.emit({ type: 'ok', payload: { txn: ev.txn } });
    } else if (ev.op === 'crash') {
      const lostPool = [...pool.entries()].map(([key, value]) => ({ key, value }));
      const lostRecords = logBuf.map((r) => ({ ...r }));
      pool.clear();
      logBuf = [];
      await ctx.emit({
        type: 'crash',
        payload: { lostPool, lostRecords, keptLsns: logFile.map((r) => r.lsn) },
      });
    } else if (ev.op === 'restart') {
      const committed = new Set<string>();
      for (const r of logFile) {
        if (ctx.cancelled) return;
        if (r.kind === 'commit') committed.add(r.txn);
      }
      const applied: { lsn: number; key: string; after: number }[] = [];
      for (const r of logFile) {
        if (ctx.cancelled) return;
        if (r.kind !== 'update' || !committed.has(r.txn)) continue;
        if (!dataFile.has(r.key)) throw new Error(`durable-after-commit: 로그의 줄 ${r.key} 이 데이터 파일에 없다`);
        dataFile.set(r.key, r.after);
        applied.push({ lsn: r.lsn, key: r.key, after: r.after });
      }
      await ctx.emit({
        type: 'redo',
        payload: {
          applied,
          okTxns: writers.filter((w) => oked.includes(w)),
          notOkTxns: writers.filter((w) => !oked.includes(w)),
        },
      });
    } else {
      const unknown: never = ev;
      throw new Error(`durable-after-commit: 모르는 사건 ${JSON.stringify(unknown)}`);
    }
  }
}
