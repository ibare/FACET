/**
 * gap-shrink — 간격 축소 조각.
 *
 * 주장 하나: 멀리 떨어진 짝부터 견주고 보폭을 좁혀 오면, 마지막에 옆칸끼리
 * 견줄 때 할 일이 줄어든다. 근거는 화면이 들고 있는 두 수 — 보폭을 줄여 온
 * 쪽의 이동 횟수와, 처음부터 옆칸만 견준 쪽의 이동 횟수.
 *
 * ── 셈 방식
 * 한 라운드는 간격 gap 의 삽입 정렬이며, 여기서는 "짝을 견주고 어긋나면 바꾼다"
 * 는 맞바꿈(swap) 형태로 편다. 견줌은 `values[j-gap]` 와 `values[j]` 를 견줄
 * 때마다 1회(맞바꿈으로 이어지지 않은 마지막 견줌도 포함), 이동은 맞바꿈 1회당
 * 1회로 센다. 대조군(간격 1 만으로 끝까지)은 같은 함수 `countGapRun` 이 같은
 * 규칙으로 센다 — 화면의 두 수가 같은 자로 잰 것이어야 견줄 수 있다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장)
 * | type            | target                       | payload                                                        | silent |
 * |-----------------|------------------------------|----------------------------------------------------------------|--------|
 * | round-begin     | —                            | { round: number; gap: number }                                  | no     |
 * | stride-compare  | ['index:left','index:right'] | { left; right; gap; round; willSwap: boolean; comparisons }     | no     |
 * | stride-swap     | ['index:left','index:right'] | { left; right; round; moves: number }                           | no     |
 * | baseline-reveal | —                            | { comparisons: number; moves: number }                          | no     |
 * | done            | —                            | { comparisons; moves; baseComparisons; baseMoves }              | no     |
 * | rewind          | —                            | 없음                                                             | no     |
 *
 * `rewind` 는 자동 재생을 마친 뒤 advance 를 눌렀을 때 처음으로 되돌리는 신호다
 * (S-piece). 화면을 초기 상태로 되돌리므로 silent 가 아니다.
 *
 * 메커니즘은 reactive — mount 즉시 자동 재생하고, 끝난 뒤에는 advance 입력마다
 * 한 걸음씩 다시 짚는다. 조각이므로 `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GapShrinkData = {
  type: 'gap-shrink';
  /** 정렬 대상. 화면의 칸 수를 정한다. */
  values: number[];
  /** 라운드마다 쓸 간격. 내림차순이며 마지막은 1 이어야 정렬이 끝난다. */
  gaps: number[];
  /** 걸음 간격 (ms). 재생 총 길이는 stage 애니메이션이 더해진 값 (S-piece). */
  stepMs: number;
};

export type GapRunTally = {
  comparisons: number;
  moves: number;
  values: number[];
};

/**
 * 주어진 간격 목록으로 정렬했을 때의 견줌·이동 횟수를 센다.
 *
 * 재생 루프와 같은 규칙으로 세므로, 대조군(간격 1 만) 수치를 손으로 적지 않고
 * 구조에서 얻는다.
 */
export function countGapRun(input: readonly number[], gaps: readonly number[]): GapRunTally {
  const values = [...input];
  let comparisons = 0;
  let moves = 0;
  for (const gap of gaps) {
    for (let i = gap; i < values.length; i++) {
      let j = i;
      while (j >= gap) {
        comparisons += 1;
        if (values[j - gap] <= values[j]) break;
        const carried = values[j - gap];
        values[j - gap] = values[j];
        values[j] = carried;
        moves += 1;
        j -= gap;
      }
    }
  }
  return { comparisons, moves, values };
}

export const gapShrinkAlgorithm = async (ctx: FacetContext<GapShrinkData>): Promise<void> => {
  const rc = ctx as ReactiveContext<GapShrinkData>;
  const initial = [...ctx.data.values];
  const gaps = [...ctx.data.gaps];
  const stepMs = ctx.data.stepMs;
  const baseline = countGapRun(initial, [1]);

  /** 자동 재생을 마친 뒤에는 걸음마다 advance 입력을 기다린다. */
  let stepwise = false;
  /** 되감기 직후의 첫 문은 그냥 통과시킨다 — 누름 한 번에 첫 걸음까지 보인다. */
  let openFirstGate = false;

  const gate = async (): Promise<void> => {
    if (!stepwise) return;
    if (openFirstGate) {
      openFirstGate = false;
      return;
    }
    await rc.waitForInput();
  };

  const pause = async (ms: number): Promise<void> => {
    if (stepwise) return;
    await rc.sleep(ms);
  };

  const play = async (): Promise<void> => {
    const values = [...initial];
    let comparisons = 0;
    let moves = 0;

    for (let round = 0; round < gaps.length; round++) {
      if (ctx.cancelled) return;
      const gap = gaps[round];
      await gate();
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'round-begin', payload: { round, gap } });
      await pause(stepMs);

      for (let i = gap; i < values.length; i++) {
        if (ctx.cancelled) return;
        let j = i;
        while (j >= gap) {
          if (ctx.cancelled) return;
          const left = j - gap;
          const willSwap = values[left] > values[j];
          await gate();
          if (ctx.cancelled) return;
          comparisons += 1;
          await ctx.emit({
            type: 'stride-compare',
            target: [`index:${left}`, `index:${j}`],
            payload: { left, right: j, gap, round, willSwap, comparisons },
          });
          if (!willSwap) {
            await pause(Math.round(stepMs * 0.4));
            break;
          }
          await pause(Math.round(stepMs * 0.25));
          const carried = values[left];
          values[left] = values[j];
          values[j] = carried;
          moves += 1;
          await ctx.emit({
            type: 'stride-swap',
            target: [`index:${left}`, `index:${j}`],
            payload: { left, right: j, round, moves },
          });
          await pause(Math.round(stepMs * 0.45));
          j = left;
        }
      }
    }

    await gate();
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'baseline-reveal',
      payload: { comparisons: baseline.comparisons, moves: baseline.moves },
    });
    await pause(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'done',
      payload: {
        comparisons,
        moves,
        baseComparisons: baseline.comparisons,
        baseMoves: baseline.moves,
      },
    });
  };

  await play();

  // 자동 재생이 끝난 뒤 — advance 를 누를 때마다 처음부터 한 걸음씩.
  for (;;) {
    if (ctx.cancelled) return;
    await rc.waitForInput();
    if (ctx.cancelled) return;
    stepwise = true;
    openFirstGate = true;
    await ctx.emit({ type: 'rewind' });
    await play();
  }
};
