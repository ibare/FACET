/**
 * 틀린 짐작의 값 — 같은 분기 열을 같은 짐작으로 두 파이프라인에 흘린다.
 *
 * 분기 하나를 한 사이클에 하나씩 가져온다. 짐작은 결과를 보기 전에 정해진다.
 * 판정이 k 단계째에 나는 파이프라인에서 짐작이 틀리면, 그 분기 뒤로 가져온
 * k − 1 개를 버린다 — 벌칙 k − 1 사이클. 맞으면 벌칙이 없다.
 *
 * 이벤트 (모두 걸음이다. silent 없음)
 *
 * - `init`   { outcomes: ('T'|'N')[]; guess: 'T'|'N';
 *              pipes: { id: 'shallow'|'deep'; verdict: number }[];
 *              room: { blocks: number; chunks: number } }
 *            room 은 버린 박자 더미가 끝까지 가장 높이 쌓일 칸 수(blocks)와
 *            틀리는 횟수(chunks). 그림이 더미의 눈금을 처음부터 정하는 데 쓴다.
 * - `branch` { index: number; actual: 'T'|'N'; hit: boolean;
 *              penalty: number[]; wasted: number[]; cycles: number[] }
 *            index 는 0 부터. penalty · wasted · cycles 는 pipes 순서.
 *            penalty 는 이번 분기로 버린 박자, wasted 는 지금까지 버린 박자,
 *            cycles 는 지금까지 흐른 사이클 (가져온 분기 수 + 버린 박자).
 * - `done`   { misses: number; wasted: number[]; cycles: number[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Outcome = 'T' | 'N';
export type PipeId = 'shallow' | 'deep';
export type Pipe = { id: PipeId; verdict: number };

export type MispredictionPenaltyFacetData = {
  type: 'misprediction-penalty';
  stepMs: number;
  outcomes: Outcome[];
  guess: Outcome;
  pipes: Pipe[];
};

export async function mispredictionPenalty(
  ctx0: FacetContext<MispredictionPenaltyFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<MispredictionPenaltyFacetData>;
  const { stepMs, outcomes, guess, pipes } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 틀린 짐작 한 번의 벌칙: 판정 단계 앞에서 가져온 것을 다 버린다.
  const penaltyOf = pipes.map((p) => Math.max(0, p.verdict - 1));
  const misses = outcomes.filter((o) => o !== guess).length;
  const blocks = Math.max(0, ...penaltyOf.map((p) => p * misses));

  await ctx.emit({
    type: 'init',
    payload: {
      outcomes: [...outcomes],
      guess,
      pipes: pipes.map((p) => ({ id: p.id, verdict: p.verdict })),
      room: { blocks, chunks: misses },
    },
  });

  const wasted = pipes.map(() => 0);
  for (let i = 0; i < outcomes.length; i += 1) {
    if (!(await pause())) return;
    const actual = outcomes[i];
    const hit = actual === guess;
    const penalty = penaltyOf.map((p) => (hit ? 0 : p));
    for (let p = 0; p < wasted.length; p += 1) {
      if (ctx.cancelled) return;
      wasted[p] += penalty[p];
    }
    await ctx.emit({
      type: 'branch',
      payload: {
        index: i,
        actual,
        hit,
        penalty,
        wasted: [...wasted],
        cycles: wasted.map((w) => i + 1 + w),
      },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'done',
    payload: {
      misses,
      wasted: [...wasted],
      cycles: wasted.map((w) => outcomes.length + w),
    },
  });
}
