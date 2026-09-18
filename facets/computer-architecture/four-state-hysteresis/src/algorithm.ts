/**
 * 네 칸을 오간다 — 2비트 포화 카운터가 분기 결과마다 한 칸씩 오르내린다.
 *
 * 상태는 0·1·2·3. 2 이상이면 T 로 짐작한다. 결과를 보기 전에 짐작하고, 본 뒤에
 * T 면 +1, N 이면 −1 로 옮긴다. 0 과 3 에서 멈춘다(포화). 걸음 하나 = 분기 하나.
 *
 * 이벤트 (모두 걸음 경계, silent 없음)
 *
 *   init    payload { outcomes: ('T' | 'N')[]; start: number; guess: 'T' | 'N' }
 *           결과 열과 처음 상태, 처음 짐작.
 *   branch  payload { i: number; outcome: 'T' | 'N'; from: number; to: number;
 *                     guess: 'T' | 'N'; next: 'T' | 'N'; hit: boolean }
 *           i 번째(0 부터) 분기. guess 는 from 에서 낸 짐작, next 는 to 에서 낼
 *           다음 짐작, hit 은 guess === outcome.
 *   done    payload { hits: number; misses: number }
 *           결과 열을 다 먹었다. 맞힌 수와 틀린 수.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Outcome = 'T' | 'N';

export interface FourStateHysteresisFacetData {
  type: 'four-state-hysteresis';
  /** 분기 결과 열. */
  outcomes: Outcome[];
  /** 카운터의 처음 상태 (0~3). */
  start: number;
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
}

const TOP = 3;
const LINE = 2;

function guessOf(state: number): Outcome {
  return state >= LINE ? 'T' : 'N';
}

function move(state: number, outcome: Outcome): number {
  return outcome === 'T' ? Math.min(TOP, state + 1) : Math.max(0, state - 1);
}

export async function fourStateHysteresis(
  context: FacetContext<FourStateHysteresisFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<FourStateHysteresisFacetData>;
  const { outcomes, start, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let state = Math.max(0, Math.min(TOP, start));
  await ctx.emit({
    type: 'init',
    payload: { outcomes: [...outcomes], start: state, guess: guessOf(state) },
  });

  let hits = 0;
  let misses = 0;
  for (let i = 0; i < outcomes.length; i += 1) {
    if (!(await pause())) return;
    const outcome = outcomes[i] as Outcome;
    const from = state;
    const guess = guessOf(from);
    const to = move(from, outcome);
    const hit = guess === outcome;
    if (hit) hits += 1;
    else misses += 1;
    state = to;
    await ctx.emit({
      type: 'branch',
      payload: { i, outcome, from, to, guess, next: guessOf(to), hit },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { hits, misses } });
}
