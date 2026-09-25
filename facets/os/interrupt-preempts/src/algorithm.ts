/**
 * 인터럽트 조각 — 장치가 부르면 CPU 는 하던 명령을 끝낸 경계에서 처리기로 건너가고,
 * 처리기의 마지막 명령(`return`)이 끝나면 적어 둔 돌아올 자리로 되돌아온다.
 *
 * 모형: 명령 하나 = 1 틱 (프로그램 명령 · 처리기 명령 모두). 부름은 명령 경계에서만 받는다.
 * 부름이 경계에 딱 겹치면 규약이 따로 필요하므로 던진다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 걸음 하나):
 * - `run`    { seg: 'program' | 'handler'; index: number; from: number; to: number;
 *              call: number | null;                       // 이 명령 도중 부름이 온 시각
 *              finish: { end: number; plain: number; delay: number } | null }
 *                                                         // 프로그램 마지막 명령일 때만
 *   명령 하나를 from..to 틱 동안 실행한다.
 * - `accept` { at: number; calledAt: number; wait: number; returnTo: number; from: number }
 *   경계 at 에서 부름을 받는다. 돌아올 자리(다음 프로그램 명령 번호 returnTo)를 적고
 *   처리기 첫 명령으로 건너간다. from 은 건너가기 직전에 실행한 프로그램 명령 번호.
 * - `return` { at: number; to: number; from: number }
 *   처리기 마지막 명령(from)이 끝난 시각 at 에 적어 둔 프로그램 명령 to 로 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InterruptPreemptsHandlerOp = 'read' | 'store' | 'return';

export interface InterruptPreemptsFacetData {
  type: 'interrupt-preempts';
  /** 프로그램 명령 식별자. 화면에는 번호로만 뜬다 */
  program: string[];
  /** 처리기 명령 식별자. 마지막은 `return` */
  handler: InterruptPreemptsHandlerOp[];
  /** 부르는 장치 식별자 */
  device: 'keyboard';
  /** 장치가 부르는 시각 (틱) */
  callAt: number;
  stepMs: number;
}

const HANDLER_OPS: readonly string[] = ['read', 'store', 'return'];

/** 자료를 좁힌다. 모르는 모양은 조용히 넘기지 않고 던진다 (C6). */
export function readInterruptPreemptsData(raw: unknown): InterruptPreemptsFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('interrupt-preempts: 자료가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  const program = d['program'];
  if (!Array.isArray(program) || program.length === 0) {
    throw new Error('interrupt-preempts: program 은 비지 않은 배열이어야 한다');
  }
  const prog: string[] = [];
  for (const p of program) {
    if (typeof p !== 'string' || p === '') throw new Error(`interrupt-preempts: 프로그램 명령 ${String(p)} 은 식별자가 아니다`);
    prog.push(p);
  }
  const handler = d['handler'];
  if (!Array.isArray(handler) || handler.length === 0) {
    throw new Error('interrupt-preempts: handler 는 비지 않은 배열이어야 한다');
  }
  const hand: InterruptPreemptsHandlerOp[] = [];
  for (const h of handler) {
    if (typeof h !== 'string' || !HANDLER_OPS.includes(h)) {
      throw new Error(`interrupt-preempts: 모르는 처리기 명령 ${String(h)}`);
    }
    hand.push(h as InterruptPreemptsHandlerOp);
  }
  if (hand[hand.length - 1] !== 'return') {
    throw new Error('interrupt-preempts: 처리기의 마지막 명령은 return 이어야 돌아올 수 있다');
  }
  if (d['device'] !== 'keyboard') {
    throw new Error(`interrupt-preempts: 모르는 장치 ${String(d['device'])}`);
  }
  const callAt = d['callAt'];
  if (typeof callAt !== 'number' || !Number.isFinite(callAt)) {
    throw new Error('interrupt-preempts: callAt 은 수여야 한다');
  }
  // 명령 하나 = 1 틱이라 경계는 정수 시각이다. 경계에 겹치면 규약이 따로 필요하다.
  if (Number.isInteger(callAt)) {
    throw new Error(`interrupt-preempts: 부름 시각 ${callAt} 이 명령 경계에 겹친다`);
  }
  if (callAt <= 0 || callAt >= prog.length) {
    throw new Error(`interrupt-preempts: 부름 시각 ${callAt} 이 프로그램 실행 도중이 아니다`);
  }
  const stepMs = d['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('interrupt-preempts: stepMs 는 양수여야 한다');
  }
  return { type: 'interrupt-preempts', program: prog, handler: hand, device: 'keyboard', callAt, stepMs };
}

export async function interruptPreempts(
  context: FacetContext<InterruptPreemptsFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<InterruptPreemptsFacetData>;
  const data = readInterruptPreemptsData(ctx.data);
  const { program, handler, callAt, stepMs } = data;
  const tick = 1;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let t = 0;
  let pc = 0; // 다음에 실행할 프로그램 명령 번호
  let pending = false;
  let handled = false;

  // 걸음 0 은 이미 프로그램 여섯 줄이 선 화면이라, 첫 문이 읽을 틈이 된다.
  while (pc < program.length) {
    if (!(await pause())) return;

    // 명령 경계에서만 부름을 확인한다
    if (pending && !handled) {
      const returnTo = pc;
      await ctx.emit({
        type: 'accept',
        payload: { at: t, calledAt: callAt, wait: t - callAt, returnTo, from: pc - 1 },
      });
      for (let h = 0; h < handler.length; h++) {
        if (!(await pause())) return;
        await ctx.emit({
          type: 'run',
          payload: { seg: 'handler', index: h, from: t, to: t + tick, call: null, finish: null },
        });
        t += tick;
      }
      handled = true;
      if (!(await pause())) return;
      await ctx.emit({ type: 'return', payload: { at: t, to: returnTo, from: handler.length - 1 } });
      continue;
    }

    const from = t;
    const to = t + tick;
    let call: number | null = null;
    if (!pending && !handled) {
      if (callAt === from) throw new Error(`interrupt-preempts: 부름이 경계 ${from} 에 겹친다`);
      if (from < callAt && callAt < to) {
        pending = true;
        call = callAt;
      }
    }
    const last = pc === program.length - 1;
    if (last && pending && !handled) {
      throw new Error('interrupt-preempts: 마지막 명령 도중 온 부름은 받을 경계가 프로그램 안에 없다');
    }
    const plain = program.length * tick;
    const finish = last ? { end: to, plain, delay: to - plain } : null;
    await ctx.emit({
      type: 'run',
      payload: { seg: 'program', index: pc, from, to, call, finish },
    });
    t = to;
    pc += 1;
  }
}
