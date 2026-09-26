/**
 * timerIsAFloor — 타이머는 최소 시간이지 약속이 아니다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   'timer:schedule'  { id: string; delayMs: number; queued: boolean; queue: string[] }
 *     — setTimeout(fn, delayMs) 등록. 만기(= 등록 시각 + delayMs)가 이미 지났거나
 *       지금이면(delayMs<=0) 그 자리에서 태스크 줄에 선다(queued:true).
 *   'timer:due'       { id: string; queue: string[] }
 *     — 등록 때는 아직 만기가 아니었던 타이머가 만기에 이르러 태스크 줄에 선다.
 *       (스택이 바빠도 줄에는 선다 — 타이머는 스택 밖에서 센다)
 *   'script:end'      { at: number }
 *     — 스크립트가 끝나 스택이 빈다. at 은 그 시각(ms).
 *   'timer:dequeue'   { id: string; requestedMs: number; actualMs: number; latenessMs: number; runUntil: number; queue: string[] }
 *     — 태스크 줄에서 꺼내 콜백을 부른다. requestedMs 는 청한 지연, actualMs 는
 *       실제로 불린 시각, latenessMs = actualMs - requestedMs, runUntil 은 그
 *       콜백이 스택을 놓아 주는 시각(actualMs + busyMs).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 코드 다섯 줄 중 하나의 타이머가 걸린 구조 — 등록 줄과 콜백 줄은 자료다. */
export interface TimerSpec {
  id: string;
  delayMs: number;
  busyMs: number;
  scheduleLine: number;
  callbackLine: number;
}

export interface TimerIsAFloorFacetData {
  type: 'timer-is-a-floor';
  /** 화면에 그대로 올릴 다섯 줄 — 번역하지 않는 자료 (native JS). */
  code: string[];
  /** 스크립트 자신이 스택을 붙잡는 시간(busyFor(9)). */
  scriptBusyMs: number;
  /** code 에서 그 busyFor(scriptBusyMs) 줄의 인덱스. */
  scriptLine: number;
  timers: TimerSpec[];
  stepMs: number;
}

export async function timerIsAFloor(ctx: FacetContext<TimerIsAFloorFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<TimerIsAFloorFacetData>;
  const { scriptBusyMs, timers, stepMs } = rc.data;
  if (!Array.isArray(timers) || timers.length === 0) {
    throw new Error('timer-is-a-floor: timers 가 비어 있다');
  }

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const queue: string[] = [];

  // 등록 — setTimeout 두 호출은 전부 t=0. 만기가 지금이거나 지났으면(delayMs<=0)
  // 그 자리에서 태스크 줄에 선다.
  for (const timer of timers) {
    if (!(await pause())) return;
    const queuedNow = timer.delayMs <= 0;
    if (queuedNow) queue.push(timer.id);
    await rc.emit({
      type: 'timer:schedule',
      target: `timer:${timer.id}`,
      payload: { id: timer.id, delayMs: timer.delayMs, queued: queuedNow, queue: [...queue] },
    });
  }

  // 만기 — 등록 때는 줄 밖이던 타이머가 스크립트가 도는 동안(스택이 바빠도) 만기에
  // 이르러 태스크 줄에 선다. 만기 시각 오름차순으로.
  const pending = timers.filter((t) => t.delayMs > 0).sort((a, b) => a.delayMs - b.delayMs);
  for (let i = 0; i < pending.length; i += 1) {
    if (!(await pause())) return;
    const timer = pending[i];
    if (i > 0 && pending[i - 1].delayMs === timer.delayMs) {
      throw new Error(
        `timer-is-a-floor: 만기가 같은 타이머가 있다(${pending[i - 1].id}, ${timer.id}) — 동률은 이 모형 밖이다`,
      );
    }
    if (timer.delayMs > scriptBusyMs) {
      throw new Error(
        `timer-is-a-floor: ${timer.id} 의 만기(${timer.delayMs}ms)가 스크립트가 끝난 뒤(${scriptBusyMs}ms)다 — 이 조각의 모형 밖 데이터다`,
      );
    }
    queue.push(timer.id);
    await rc.emit({ type: 'timer:due', target: `timer:${timer.id}`, payload: { id: timer.id, queue: [...queue] } });
  }

  // 스크립트 끝 — 스택이 빈다.
  if (!(await pause())) return;
  await rc.emit({ type: 'script:end', payload: { at: scriptBusyMs } });

  // 태스크 줄을 등록 순서(FIFO)대로 비운다. 스택은 콜백 하나가 끝나야 다음을 낸다.
  let clock = scriptBusyMs;
  while (queue.length > 0) {
    if (!(await pause())) return;
    const id = queue.shift();
    if (id === undefined) throw new Error('timer-is-a-floor: 빈 태스크 줄에서 꺼내려 했다');
    const timer = timers.find((t) => t.id === id);
    if (!timer) throw new Error(`timer-is-a-floor: 알 수 없는 타이머 id(${id})`);
    const actualMs = clock;
    const latenessMs = actualMs - timer.delayMs;
    const runUntil = actualMs + timer.busyMs;
    await rc.emit({
      type: 'timer:dequeue',
      target: `timer:${id}`,
      payload: { id, requestedMs: timer.delayMs, actualMs, latenessMs, runUntil, queue: [...queue] },
    });
    clock = runUntil;
  }
}
