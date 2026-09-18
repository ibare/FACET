/**
 * draft-then-verify — 작은 모형이 먼저 쓴 토큰을 큰 모형이 한 번에 확인한다 (추측 디코딩).
 *
 * 판마다 세 걸음을 낸다. 판정(몇을 받는가)은 알고리즘이 payload 로 싣지 않는다 —
 * 바탕(초안과 큰 모형의 고른 토큰)에서 결정되는 셈이라 장면이 `judgeRound` 로 한 번 센다.
 *
 * 이벤트 (모두 걸음이다. silent 없음)
 *   - `draft`  { round: number }  작은 모형이 그 판의 초안을 문장 끝 너머에 놓는다
 *   - `verify` { round: number }  큰 모형 한 번이 초안 전부를 앞에서부터 훑어 판정한다
 *   - `commit` { round: number }  받은 초안 + 큰 모형 토큰 하나가 문장에 붙고, 나머지는 떨어져 나간다
 *
 * `round` 는 0 부터 센 판 번호다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DraftThenVerifyRound = {
  /** 작은 모형의 초안 (예로 정한 값) */
  draft: string[];
  /** 큰 모형이 각 자리에서 고른 토큰 — 거절 자리까지, 모두 받은 판은 덤까지 (예로 정한 값) */
  picks: string[];
};

export type DraftThenVerifyFacetData = {
  type: 'draft-then-verify';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 처음 문장 — 낱말 하나가 토큰 하나 */
  prompt: string[];
  rounds: DraftThenVerifyRound[];
};

export async function draftThenVerify(
  context: FacetContext<DraftThenVerifyFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DraftThenVerifyFacetData>;
  const stepMs = ctx.data.stepMs;
  const rounds = ctx.data.rounds;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let round = 0; round < rounds.length; round += 1) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'draft', payload: { round } });
    if (!(await pause())) return;
    await ctx.emit({ type: 'verify', payload: { round } });
    if (!(await pause())) return;
    await ctx.emit({ type: 'commit', payload: { round } });
    if (!(await pause())) return;
  }
}
