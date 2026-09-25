/**
 * 폴링과 인터럽트 — 같은 장치 · 같은 준비 시각을 두고 두 CPU 가 나란히 틱을 쓴다.
 *
 * 모형: 한 걸음 = 한 틱. 장치 · 폴링 CPU · 인터럽트 CPU 가 같은 틱에 함께 한 칸씩 나아간다.
 * - 장치는 틱 0 에 일을 시작하고 틱 `readyAt` 부터 준비됨이 보인다
 * - 폴링 CPU 는 틱마다 한 번 묻는다 (묻기 1 틱). 틱 k 에 묻고 k ≥ readyAt 이면 "예", 아니면 "아니오".
 *   "예" 를 들은 다음 틱부터 `takeTicks` 틱 동안 데이터를 받아 간다
 * - 인터럽트 CPU 는 준비될 때까지 딴 일을 1 틱씩 한다. 준비되는 틱에 불려 처리기로 들어가고
 *   (`entryTicks` 틱), 이어 `takeTicks` 틱 동안 받아 간다
 *
 * 이벤트
 * - `init` (silent) — payload `{ slots: number }`
 *     두 CPU 가 쓰는 틱 수 중 큰 것. 그림이 쌓일 칸의 크기를 처음부터 정하는 데 쓴다
 * - `tick` — payload
 *     `{ tick: number; ready: boolean;
 *        poll: 'no' | 'yes' | 'take' | null; intr: 'other' | 'enter' | 'take' | null;
 *        pollDone: number | null; intrDone: number | null }`
 *     `poll` · `intr` 는 그 틱에 각 CPU 가 한 일 (이미 끝났으면 null).
 *     `pollDone` · `intrDone` 은 그 CPU 가 이 틱으로 일을 마쳤으면 끝 시각 (틱 + 1), 아니면 null
 *
 * 셈은 전부 여기서 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PollingVsInterruptFacetData = {
  type: 'polling-vs-interrupt';
  /** 장치가 준비됨이 보이기 시작하는 틱 */
  readyAt: number;
  /** 인터럽트 쪽: 처리기로 들어가는 데 드는 틱 */
  entryTicks: number;
  /** 두 쪽 모두: 데이터를 받아 가는 데 드는 틱 */
  takeTicks: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type PollWork = 'no' | 'yes' | 'take';
export type IntrWork = 'other' | 'enter' | 'take';

function checkCount(name: string, value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new Error(`polling-vs-interrupt: ${name} 는 ${min} 이상의 정수여야 한다 (받은 값: ${String(value)})`);
  }
  return value;
}

/** 폴링 CPU 가 틱마다 한 일. 틱 k 에 묻고, 준비됐으면 "예" 뒤에 받아 간다. */
export function pollingSchedule(readyAt: number, takeTicks: number): PollWork[] {
  const out: PollWork[] = [];
  let k = 0;
  for (;;) {
    const ready = k >= readyAt;
    out.push(ready ? 'yes' : 'no');
    k += 1;
    if (ready) break;
  }
  for (let i = 0; i < takeTicks; i += 1) out.push('take');
  return out;
}

/** 인터럽트 CPU 가 틱마다 한 일. 준비될 때까지 딴 일, 불리면 들어가기, 이어 받아 가기. */
export function interruptSchedule(readyAt: number, entryTicks: number, takeTicks: number): IntrWork[] {
  const out: IntrWork[] = [];
  for (let k = 0; k < readyAt; k += 1) out.push('other');
  for (let i = 0; i < entryTicks; i += 1) out.push('enter');
  for (let i = 0; i < takeTicks; i += 1) out.push('take');
  return out;
}

export async function pollingVsInterrupt(
  context: FacetContext<PollingVsInterruptFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PollingVsInterruptFacetData>;
  const data = ctx.data;
  const readyAt = checkCount('readyAt', data.readyAt, 0);
  const entryTicks = checkCount('entryTicks', data.entryTicks, 1);
  const takeTicks = checkCount('takeTicks', data.takeTicks, 1);
  const stepMs = checkCount('stepMs', data.stepMs, 0);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const poll = pollingSchedule(readyAt, takeTicks);
  const intr = interruptSchedule(readyAt, entryTicks, takeTicks);
  const horizon = Math.max(poll.length, intr.length);

  await ctx.emit({ type: 'init', payload: { slots: horizon }, silent: true });

  for (let k = 0; k < horizon; k += 1) {
    // 걸음 0 (장치가 막 일을 시작한 화면) 에도 읽을 틈을 둔다 — 첫 문도 그대로 지난다
    if (!(await pause())) return;
    const p = k < poll.length ? poll[k] : undefined;
    const i = k < intr.length ? intr[k] : undefined;
    await ctx.emit({
      type: 'tick',
      payload: {
        tick: k,
        ready: k >= readyAt,
        poll: p ?? null,
        intr: i ?? null,
        pollDone: k === poll.length - 1 ? k + 1 : null,
        intrDone: k === intr.length - 1 ? k + 1 : null,
      },
    });
  }
}
