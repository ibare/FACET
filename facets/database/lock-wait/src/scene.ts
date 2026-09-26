/**
 * lock-wait 장면 — 이벤트를 잇기만 한다. 대기열 · 기다린 걸음 · 넘겨받을 이는 알고리즘이 셈해 싣는다.
 *
 * 바탕: row · txns (initial 이 한 번 정한다)
 * 자취: value · holder · wrote · queue · done
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLockWaitData } from './algorithm.js';
import type { WaitEntry } from './algorithm.js';

export type LockWaitStep =
  | { kind: 'grant'; txn: string }
  | { kind: 'wait'; txn: string }
  | { kind: 'write'; txn: string; before: number; after: number }
  /** 놓기 전 줄에서 넘겨받은 이는 맨 앞(0), 남은 이는 모두 한 칸씩 당겨졌다 */
  | { kind: 'commit'; txn: string; granted: WaitEntry | null };

export interface LockWaitScene {
  row: string;
  txns: string[];
  value: number;
  holder: WaitEntry | null;
  /** 잠금을 쥔 이가 이미 썼는가 */
  wrote: boolean;
  queue: WaitEntry[];
  /** 커밋을 마친 차례대로 */
  done: WaitEntry[];
  step: LockWaitStep | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readEntry(v: unknown, where: string): WaitEntry {
  if (!isRecord(v) || typeof v.txn !== 'string' || typeof v.waited !== 'number') {
    throw new Error(`lock-wait 장면: ${where} 의 모양을 모른다`);
  }
  return { txn: v.txn, waited: v.waited };
}

function readHolder(v: unknown): WaitEntry | null {
  return v === null ? null : readEntry(v, 'holder');
}

function readQueue(v: unknown): WaitEntry[] {
  if (!Array.isArray(v)) throw new Error('lock-wait 장면: queue 가 배열이 아니다');
  return v.map((q) => readEntry(q, 'queue'));
}

function readTxn(p: Record<string, unknown>): string {
  if (typeof p.txn !== 'string') throw new Error('lock-wait 장면: txn 이 없다');
  return p.txn;
}

export const lockWaitScene: ScenePlan<LockWaitScene> = {
  initial(initialData: unknown): LockWaitScene {
    const data = narrowLockWaitData(initialData);
    return {
      row: data.row,
      txns: [...data.txns],
      value: data.value,
      holder: null,
      wrote: false,
      queue: [],
      done: [],
      step: null,
    };
  },

  reduce(scene: LockWaitScene, event: FacetRuntimeEvent): LockWaitScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`lock-wait 장면: ${event.type} 의 payload 가 객체가 아니다`);
    if (event.type === 'lock-grant' || event.type === 'lock-wait') {
      const txn = readTxn(p);
      return {
        ...scene,
        holder: readHolder(p.holder),
        queue: readQueue(p.queue),
        done: [...scene.done],
        step: event.type === 'lock-grant' ? { kind: 'grant', txn } : { kind: 'wait', txn },
      };
    }
    if (event.type === 'write') {
      const txn = readTxn(p);
      if (typeof p.before !== 'number' || typeof p.after !== 'number') throw new Error('lock-wait 장면: write 의 값이 없다');
      return {
        ...scene,
        value: p.after,
        holder: readHolder(p.holder),
        wrote: true,
        queue: readQueue(p.queue),
        done: [...scene.done],
        step: { kind: 'write', txn, before: p.before, after: p.after },
      };
    }
    if (event.type === 'commit') {
      const txn = readTxn(p);
      const released = readEntry(p.released, 'released');
      const granted = p.granted === null ? null : readEntry(p.granted, 'granted');
      return {
        ...scene,
        holder: readHolder(p.holder),
        wrote: false,
        queue: readQueue(p.queue),
        done: [...scene.done, released],
        step: { kind: 'commit', txn, granted },
      };
    }
    return scene;
  },
};
