/**
 * lock-wait — 이미 잠긴 줄을 고치려는 트랜잭션은 남이 놓을 때까지 줄 서서 기다린다.
 *
 * 규약 (사양 그대로):
 *   - 엄격한 2단계 잠금. 쓰기는 X 잠금을 쥔 뒤에만 하고, 잠금은 **커밋 때** 놓는다.
 *   - 잠금은 줄 하나 단위, 이 조각의 요청은 전부 배타(X) 잠금이다. X 는 무엇과도 함께 쥘 수 없다.
 *   - 기다림 줄은 먼저 온 차례(FIFO). 줄이 비어 있지 않으면 새 요청은 줄 뒤에 선다.
 *   - 놓을 때 줄 맨 앞이 넘겨받는다 — 넘겨받기는 놓기와 같은 걸음이다.
 *   - 쓰기 W(−n) = 지금 확정된 값을 읽어 n 을 뺀다.
 *   - 기다린 걸음 = 넘겨받은 걸음 − 요청한 걸음. 걸음 번호는 사건 차례(1 부터)다.
 *
 * 걸음 0 은 처음 상태(장면의 initial 이 initialData 에서 세운다). 사건 하나가 걸음 하나다.
 *
 * 이벤트 (전부 silent 아님). 모든 payload 에 걸음 뒤의 `holder` 와 `queue` 가 실린다.
 *   holder: { txn: string; waited: number } | null   — 잠금을 쥔 이와 그가 기다린 걸음
 *   queue:  { txn: string; waited: number }[]        — 줄 앞부터, 지금까지 기다린 걸음
 *
 *   'lock-grant'  { txn, holder, queue }                  — 요청이 곧바로 허락됨
 *   'lock-wait'   { txn, holder, queue }                  — 요청이 줄 뒤에 멈춰 섬
 *   'write'       { txn, before, after, holder, queue }   — 확정값 before 를 읽어 after 를 씀
 *   'commit'      { txn, released: { txn, waited }, granted: { txn, waited } | null, holder, queue }
 *                 — 커밋이 쥔 잠금을 놓고, 줄 맨 앞이 있으면 같은 걸음에 넘겨받음
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LockWaitStepSpec =
  | { kind: 'lock'; txn: string }
  | { kind: 'write'; txn: string; delta: number }
  | { kind: 'commit'; txn: string };

export interface LockWaitFacetData {
  type: 'lock-wait';
  stepMs: number;
  /** 잠기는 줄 이름 — 번역하지 않는 자료 */
  row: string;
  /** 줄의 처음 확정값 */
  value: number;
  /** 트랜잭션 이름 (`T` + 번호) */
  txns: string[];
  /** 사건 차례 */
  events: LockWaitStepSpec[];
}

export interface WaitEntry {
  txn: string;
  waited: number;
}

const TXN_NAME = /^T\d+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** initialData 를 좁힌다. 모르는 모양은 던진다. */
export function narrowLockWaitData(raw: unknown): LockWaitFacetData {
  if (!isRecord(raw) || raw.type !== 'lock-wait') throw new Error('lock-wait: initialData.type 이 lock-wait 가 아니다');
  const { stepMs, row, value, txns, events } = raw;
  if (typeof stepMs !== 'number') throw new Error('lock-wait: stepMs 가 수가 아니다');
  if (typeof row !== 'string' || row === '') throw new Error('lock-wait: row 가 비었다');
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error('lock-wait: value 가 정수가 아니다');
  if (!Array.isArray(txns) || txns.length === 0) throw new Error('lock-wait: txns 가 비었다');
  const names: string[] = [];
  for (const name of txns) {
    if (typeof name !== 'string' || !TXN_NAME.test(name)) throw new Error(`lock-wait: 트랜잭션 이름 ${String(name)} 이 T+번호 꼴이 아니다`);
    if (names.includes(name)) throw new Error(`lock-wait: 트랜잭션 이름 ${name} 이 겹친다`);
    names.push(name);
  }
  if (!Array.isArray(events)) throw new Error('lock-wait: events 가 배열이 아니다');
  const steps: LockWaitStepSpec[] = events.map((ev, i): LockWaitStepSpec => {
    if (!isRecord(ev) || typeof ev.txn !== 'string') throw new Error(`lock-wait: 사건 ${i + 1} 의 모양을 모른다`);
    if (!names.includes(ev.txn)) throw new Error(`lock-wait: 사건 ${i + 1} 의 트랜잭션 ${ev.txn} 이 txns 에 없다`);
    if (ev.kind === 'lock') return { kind: 'lock', txn: ev.txn };
    if (ev.kind === 'commit') return { kind: 'commit', txn: ev.txn };
    if (ev.kind === 'write') {
      if (typeof ev.delta !== 'number' || !Number.isInteger(ev.delta)) throw new Error(`lock-wait: 사건 ${i + 1} 의 delta 가 정수가 아니다`);
      return { kind: 'write', txn: ev.txn, delta: ev.delta };
    }
    throw new Error(`lock-wait: 사건 ${i + 1} 의 종류 ${String(ev.kind)} 를 모른다`);
  });
  return { type: 'lock-wait', stepMs, row, value, txns: names, events: steps };
}

export async function lockWait(context: FacetContext<LockWaitFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<LockWaitFacetData>;
  const data = narrowLockWaitData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let value = data.value;
  let holder: WaitEntry | null = null;
  /** 줄 — 요청한 걸음을 함께 쥔다 */
  const queue: { txn: string; since: number }[] = [];
  const committed: string[] = [];

  const queueNow = (step: number): WaitEntry[] => queue.map((q) => ({ txn: q.txn, waited: step - q.since }));
  const holderNow = (): WaitEntry | null => (holder === null ? null : { txn: holder.txn, waited: holder.waited });

  for (let i = 0; i < data.events.length; i += 1) {
    // 걸음 0 이 이미 읽을 화면(처음 값 · 트랜잭션)이라 첫 사건 앞에도 머문다
    if (!(await pause())) return;
    const ev = data.events[i]!;
    const step = i + 1;
    if (committed.includes(ev.txn)) throw new Error(`lock-wait: 걸음 ${step} — ${ev.txn} 은 이미 커밋했다`);
    const inQueue = queue.some((q) => q.txn === ev.txn);
    if (inQueue) throw new Error(`lock-wait: 걸음 ${step} — ${ev.txn} 은 줄에서 기다리는 중이라 움직일 수 없다`);

    if (ev.kind === 'lock') {
      if (holder !== null && holder.txn === ev.txn) throw new Error(`lock-wait: 걸음 ${step} — ${ev.txn} 은 이미 잠금을 쥐었다`);
      if (holder === null && queue.length === 0) {
        holder = { txn: ev.txn, waited: 0 };
        await ctx.emit({ type: 'lock-grant', payload: { txn: ev.txn, holder: holderNow(), queue: queueNow(step) } });
      } else {
        queue.push({ txn: ev.txn, since: step });
        await ctx.emit({ type: 'lock-wait', payload: { txn: ev.txn, holder: holderNow(), queue: queueNow(step) } });
      }
    } else if (ev.kind === 'write') {
      if (holder === null || holder.txn !== ev.txn) throw new Error(`lock-wait: 걸음 ${step} — ${ev.txn} 이 X 잠금 없이 쓰려 한다`);
      const before = value;
      const after = before + ev.delta;
      value = after;
      await ctx.emit({ type: 'write', payload: { txn: ev.txn, before, after, holder: holderNow(), queue: queueNow(step) } });
    } else if (ev.kind === 'commit') {
      // 이 조각의 트랜잭션은 모두 쓰기 전에 잠금을 쥔다 — 쥔 것 없는 커밋은 모형 밖이다
      if (holder === null || holder.txn !== ev.txn) throw new Error(`lock-wait: 걸음 ${step} — ${ev.txn} 이 쥔 잠금 없이 커밋한다`);
      const released: WaitEntry = { txn: holder.txn, waited: holder.waited };
      holder = null;
      let granted: WaitEntry | null = null;
      const head = queue.shift();
      if (head !== undefined) {
        granted = { txn: head.txn, waited: step - head.since };
        holder = granted;
      }
      committed.push(ev.txn);
      await ctx.emit({
        type: 'commit',
        payload: { txn: ev.txn, released, granted, holder: holderNow(), queue: queueNow(step) },
      });
    } else {
      throw new Error(`lock-wait: 걸음 ${step} — 모르는 사건`);
    }
  }
}
