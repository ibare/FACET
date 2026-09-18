/**
 * 맞힐 수 없는 분기 — 결과가 무작위인 분기를 두 예측기가 차례로 짐작한다.
 *
 * 결과 열은 동전 던지기로 뽑아 고정한 자료다(`initialData.outcomes`). 알고리즘은 난수를
 * 쓰지 않는다. 예측기는 결과를 보기 전에 짐작하고, 본 뒤에 갱신한다. 걸음 하나 = 분기 하나.
 *
 * 예측기 둘
 *  - 2비트 포화 카운터 — 상태 0..3, 2 이상이면 T 로 짐작. T 면 +1, N 이면 −1, 0 과 3 에서 멈춘다
 *  - 이력 표 — 최근 결과 `historyBits` 개를 칸 번호로 삼는 1비트 칸 표. 칸은 마지막으로 본
 *    결과를 기억하고 그대로 짐작한다
 *
 * 이벤트 (silent 없음 — 전부 걸음이다)
 *  - `init`   payload `{ n: number }` — 결과 열의 길이
 *  - `branch` payload `{ i: number; outcome: 'T' | 'N';
 *                        counter: { guess: 'T' | 'N'; hit: boolean };
 *                        table:   { guess: 'T' | 'N'; hit: boolean } }`
 *             i 는 1 부터. 맞힌 수와 비율은 장면이 hit 를 쌓아 센다
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Outcome = 'T' | 'N';

export type UnpredictableBranchFacetData = {
  type: 'unpredictable-branch';
  /** 동전 던지기로 뽑아 고정한 분기 결과 열 */
  outcomes: Outcome[];
  /** 2비트 카운터의 처음 상태 (0..3) */
  counterStart: number;
  /** 이력 표가 칸 번호로 삼는 최근 결과의 수 */
  historyBits: number;
  /** 이력 표의 처음 이력 (오래된 것부터) */
  historyStart: Outcome[];
  /** 이력 표 칸의 처음 값 */
  cellStart: Outcome;
  stepMs: number;
};

export type Guess = { guess: Outcome; hit: boolean };

export type BranchPayload = {
  i: number;
  outcome: Outcome;
  counter: Guess;
  table: Guess;
};

function counterGuess(state: number): Outcome {
  return state >= 2 ? 'T' : 'N';
}

function counterNext(state: number, seen: Outcome): number {
  return seen === 'T' ? Math.min(3, state + 1) : Math.max(0, state - 1);
}

export async function unpredictableBranch(
  context: FacetContext<UnpredictableBranchFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<UnpredictableBranchFacetData>;
  const { outcomes, counterStart, historyBits, historyStart, cellStart, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let state = counterStart;
  let history: Outcome[] = historyStart.slice(-historyBits);
  const cells = new Map<string, Outcome>();

  await ctx.emit({ type: 'init', payload: { n: outcomes.length } });

  for (let k = 0; k < outcomes.length; k += 1) {
    if (!(await pause())) return;
    const outcome = outcomes[k];

    const cGuess = counterGuess(state);
    state = counterNext(state, outcome);

    const key = history.join('');
    const tGuess = cells.get(key) ?? cellStart;
    cells.set(key, outcome);
    history = [...history, outcome].slice(-historyBits);

    const payload: BranchPayload = {
      i: k + 1,
      outcome,
      counter: { guess: cGuess, hit: cGuess === outcome },
      table: { guess: tGuess, hit: tGuess === outcome },
    };
    await ctx.emit({ type: 'branch', payload });
  }
}
