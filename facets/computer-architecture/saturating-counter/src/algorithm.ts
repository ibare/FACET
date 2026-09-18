/**
 * 2비트 포화 카운터 — 예측기가 한 번 틀렸다고 바로 마음을 바꾸지 않으려면 얼마나 버텨야 하는가.
 *
 * b 비트 카운터는 상태 0 .. 2^b − 1 을 오간다. 처음 상태는 가장 위(가장 강한 "탄다")다.
 * 상태가 문턱 2^(b−1) 이상이면 "탄다" 로 짐작하고, 결과를 **본 뒤** 탔으면 +1, 안 탔으면 −1
 * 한다. 양끝에서는 멈춘다(포화). 결과 열은 "세 번 돌고 나가는" 안쪽 반복이 세 번 오고
 * (`turnAt` 앞), 그 뒤 갈래가 아예 뒤집힌다. 앞쪽 틀림과 뒤쪽 틀림을 따로 센다.
 *
 * 손잡이 `bits` 를 돌리면 같은 결과 열을 그 비트 수로 처음부터 다시 걷는다.
 *
 * ── 이벤트 (발신 순서대로)
 *
 *   phase          { phase }                                           silent
 *   counter-set    { bits, top, threshold, state, steps, turnAt }      판의 시작. 카운터 칸 수가 바뀐다
 *   guess          { step, state, guess }                              guess: 1 = 탄다 · 0 = 안 탄다
 *   check          { step, outcome, guess, hit, turned,
 *                    loopMisses, turnMisses }                          turned: step ≥ turnAt
 *   move           { step, from, to, threshold }                       바늘이 한 칸 오르내린다 (양끝이면 제자리)
 *   done           { bits, loopMisses, turnMisses, missCount, percent }
 *
 * ── phase 어휘 (irs.ts 와 같은 집합 — C3)
 *
 *   init    꼭대기 · 문턱 · 처음 상태를 정한다
 *   guess   상태를 문턱과 견주어 짐작한다
 *   check   짐작과 결과를 견주어 틀림을 센다
 *   update  결과를 따라 한 칸 오르내린다 (포화)
 *
 * ── 메트릭 (C5)
 *
 *   loop-miss-count  반복 구간(`turnAt` 앞)의 틀림
 *   turn-miss-count  갈래가 뒤집힌 뒤의 틀림
 *   miss-count       둘의 합
 *
 * 계기는 누적 채널이라 판이 바뀔 때 `gauge` 로 0 으로 되돌린다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SaturatingCounterData = {
  type: 'saturating-counter';
  /** 결과 열. 1 = 갈래를 탄다, 0 = 안 탄다. */
  outcomes: number[];
  /** 이 걸음 번호부터는 "뒤집힌 뒤" 로 센다. */
  turnAt: number;
  /** 손잡이 사다리 — 카운터 비트 수. facet.ts 의 segments[].value 와 같다. */
  bitsLadder: number[];
  /** 처음 판의 비트 수. 사다리의 기본 구간과 같다. */
  bits: number;
  /** 한 걸음의 박자 (ms). */
  stepMs: number;
};

export type SaturatingCounterRound = {
  top: number;
  threshold: number;
  /** 처음 상태 + 걸음마다의 상태 (길이 = outcomes.length + 1). */
  trace: number[];
  loopMisses: number;
  turnMisses: number;
  missCount: number;
  percent: number;
};

/** 순수 셈 — 한 판을 끝까지 걸은 결과. 알고리즘과 검사가 같이 쓴다. */
export function computeSaturatingCounterRound(
  outcomes: readonly number[],
  bits: number,
  turnAt: number,
): SaturatingCounterRound {
  let top = 1;
  for (let k = 0; k < bits; k += 1) top *= 2;
  top -= 1;
  const threshold = Math.floor((top + 1) / 2);
  let state = top;
  const trace = [state];
  let loopMisses = 0;
  let turnMisses = 0;
  for (let i = 0; i < outcomes.length; i += 1) {
    const guess = state >= threshold ? 1 : 0;
    if (guess !== outcomes[i]) {
      if (i < turnAt) loopMisses += 1;
      else turnMisses += 1;
    }
    state = outcomes[i] === 1 ? Math.min(top, state + 1) : Math.max(0, state - 1);
    trace.push(state);
  }
  const missCount = loopMisses + turnMisses;
  const n = outcomes.length;
  const percent = Math.floor(((n - missCount) * 100 + Math.floor(n / 2)) / n);
  return { top, threshold, trace, loopMisses, turnMisses, missCount, percent };
}

export async function saturatingCounterAlgorithm(
  base: FacetContext<SaturatingCounterData>,
): Promise<void> {
  const ctx = base as ReactiveContext<SaturatingCounterData>;
  const data = ctx.data;
  const outcomes = data.outcomes;
  const turnAt = data.turnAt;
  const ladder = data.bitsLadder;
  const stepMs = data.stepMs;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 지금 보이는 계기 값. 차이만 보내고, 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const was = shown.get(name);
    if (was === value) return;
    shown.set(name, value);
    ctx.metric(name, value - (was ?? 0));
  };

  /** 한 판을 끝까지 걷는다. 끝까지 걸었으면 true, 도중에 취소됐으면 false. */
  async function playRound(bits: number): Promise<boolean> {
    gauge('loop-miss-count', 0);
    gauge('turn-miss-count', 0);
    gauge('miss-count', 0);

    await phase('init');
    let top = 1;
    for (let k = 0; k < bits; k += 1) top *= 2;
    top -= 1;
    const threshold = Math.floor((top + 1) / 2);
    let state = top;
    await ctx.emit({
      type: 'counter-set',
      payload: { bits, top, threshold, state, steps: outcomes.length, turnAt },
    });

    let loopMisses = 0;
    let turnMisses = 0;
    for (let i = 0; i < outcomes.length; i += 1) {
      if (!(await ctx.sleep(stepMs))) return false;

      await phase('guess');
      const guess = state >= threshold ? 1 : 0;
      await ctx.emit({ type: 'guess', payload: { step: i, state, guess } });

      if (!(await ctx.sleep(stepMs / 2))) return false;
      await phase('check');
      const outcome = outcomes[i] === 1 ? 1 : 0;
      const hit = guess === outcome;
      const turned = i >= turnAt;
      if (!hit) {
        if (turned) turnMisses += 1;
        else loopMisses += 1;
      }
      gauge('loop-miss-count', loopMisses);
      gauge('turn-miss-count', turnMisses);
      gauge('miss-count', loopMisses + turnMisses);
      await ctx.emit({
        type: 'check',
        payload: { step: i, outcome, guess, hit, turned, loopMisses, turnMisses },
      });

      if (!(await ctx.sleep(stepMs / 2))) return false;
      await phase('update');
      const from = state;
      state = outcome === 1 ? Math.min(top, state + 1) : Math.max(0, state - 1);
      await ctx.emit({ type: 'move', payload: { step: i, from, to: state, threshold } });
    }

    const missCount = loopMisses + turnMisses;
    const n = outcomes.length;
    const percent = Math.floor(((n - missCount) * 100 + Math.floor(n / 2)) / n);
    await ctx.emit({
      type: 'done',
      payload: { bits, loopMisses, turnMisses, missCount, percent },
    });
    return true;
  }

  /** 손잡이 입력을 기다린다. 사다리에 있는 비트 수, 또는 취소면 null. */
  async function waitBits(): Promise<number | null> {
    for (;;) {
      if (ctx.cancelled) return null;
      const input: ReactiveInputEvent = await ctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'bits') continue;
      const p = input.payload;
      if (typeof p !== 'object' || p === null) continue;
      const value = (p as { value?: unknown }).value;
      if (typeof value !== 'number' || !ladder.includes(value)) continue;
      return value;
    }
  }

  try {
    let bits = ladder.includes(data.bits) ? data.bits : ladder[0] ?? 1;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(bits))) return;
      const next = await waitBits();
      if (next === null) return;
      bits = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    if (!ctx.cancelled) throw err;
  }
}
