/**
 * keep-old-version — MVCC 는 줄을 고칠 때 옛 판을 덮어쓰지 않고 새 판을 곁에 쌓는다.
 *
 * 규약 (사양 그대로):
 * - 판 = (값, 시작 틱, 끝 틱). 끝 틱이 없고 시작 틱이 있는 판이 **지금 판**이다.
 * - 쓰기 = 새 판을 붙인다. 시작 틱 없음(커밋 전), 옛 판은 손대지 않는다.
 * - 커밋 틱 t = 그 트랜잭션의 새 판 시작 틱 t · 그 줄의 지금 판 끝 틱 t.
 * - 판을 지우지 않는다 (청소는 이 장면 밖). 판의 차례는 붙은 차례.
 * - 틱은 사건 하나에 하나, `firstTick` 부터 1 씩.
 *
 * 이벤트 (전부 silent 아님, 사건 하나 = 걸음 하나):
 * - `write`  { tick: number; txn: string; value: number; index: number; chain: Version[] }
 *            txn 이 새 판을 붙였다. index 는 붙은 판의 자리(0 이 가장 옛 판).
 * - `commit` { tick: number; txn: string; ended: number; started: number; chain: Version[] }
 *            txn 이 커밋했다. ended 는 끝 틱이 찍힌 옛 판의 자리, started 는 시작 틱이 찍힌 새 판의 자리.
 *
 * `chain` 은 사건 뒤의 판 사슬 전체 — `{ value: number; start: number | null; end: number | null; txn: string | null }[]`.
 * 셈(지금 판 고르기 · 틱 찍기)은 여기서만 하고 장면은 사슬을 옮겨 쥐기만 한다.
 *
 * 걸음 0 (처음 판 하나)은 장면의 initial() 이 initialData 에서 세운다. 이미 읽을 것이 있는 화면이라
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Version = {
  value: number;
  start: number | null;
  end: number | null;
  /** 이 판을 쓴 트랜잭션. 처음부터 있던 판은 null. */
  txn: string | null;
};

export type KeepOldVersionEvent =
  | { op: 'write'; txn: string; value: number }
  | { op: 'commit'; txn: string };

export type KeepOldVersionFacetData = {
  type: 'keep-old-version';
  stepMs: number;
  /** 줄 이름 — 번역하지 않는 자료. */
  row: string;
  /** 처음 판 사슬. */
  versions: { value: number; start: number; end: number | null }[];
  /** 첫 사건의 틱. */
  firstTick: number;
  events: KeepOldVersionEvent[];
};

const TXN_NAME = /^T\d+$/;

/** 지금 판 — 시작 틱이 있고 끝 틱이 없는 판. 꼭 하나여야 한다. */
function currentIndex(chain: Version[], row: string, tick: number): number {
  const hits: number[] = [];
  chain.forEach((v, i) => {
    if (v.start !== null && v.end === null) hits.push(i);
  });
  if (hits.length !== 1) {
    throw new Error(`keep-old-version: 틱 ${tick} 에 줄 ${row} 의 지금 판이 ${hits.length} 개다 — 하나여야 한다`);
  }
  return hits[0] as number;
}

function copyChain(chain: Version[]): Version[] {
  return chain.map((v) => ({ ...v }));
}

export async function keepOldVersion(context: FacetContext<KeepOldVersionFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<KeepOldVersionFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const chain: Version[] = data.versions.map((v) => ({
    value: v.value,
    start: v.start,
    end: v.end,
    txn: null,
  }));
  // 처음 사슬도 지금 판이 하나여야 한다.
  currentIndex(chain, data.row, data.firstTick - 1);

  let tick = data.firstTick;
  for (const event of data.events) {
    if (!(await pause())) return;
    if (!TXN_NAME.test(event.txn)) {
      throw new Error(`keep-old-version: 틱 ${tick} 의 트랜잭션 이름 ${event.txn} 은 T 와 번호 꼴이 아니다`);
    }
    if (event.op === 'write') {
      if (chain.some((v) => v.txn === event.txn && v.start === null)) {
        throw new Error(`keep-old-version: 틱 ${tick} — ${event.txn} 은 이미 커밋 전 판을 가졌다`);
      }
      chain.push({ value: event.value, start: null, end: null, txn: event.txn });
      await ctx.emit({
        type: 'write',
        payload: {
          tick,
          txn: event.txn,
          value: event.value,
          index: chain.length - 1,
          chain: copyChain(chain),
        },
      });
    } else if (event.op === 'commit') {
      const pending: number[] = [];
      chain.forEach((v, i) => {
        if (v.txn === event.txn && v.start === null) pending.push(i);
      });
      if (pending.length !== 1) {
        throw new Error(`keep-old-version: 틱 ${tick} — ${event.txn} 의 커밋 전 판이 ${pending.length} 개다`);
      }
      const started = pending[0] as number;
      const ended = currentIndex(chain, data.row, tick);
      const old = chain[ended] as Version;
      const fresh = chain[started] as Version;
      old.end = tick;
      fresh.start = tick;
      await ctx.emit({
        type: 'commit',
        payload: { tick, txn: event.txn, ended, started, chain: copyChain(chain) },
      });
    } else {
      const unknown: never = event;
      throw new Error(`keep-old-version: 모르는 사건 ${JSON.stringify(unknown)}`);
    }
    tick += 1;
  }
}
