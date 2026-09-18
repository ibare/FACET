/**
 * 처음 한 번과 그 뒤 — 캐시가 있는 한 방식에서 걸음마다 새로 셈하는 K·V 자리.
 *
 * 규약 (사양 3 절):
 *   - 걸음 1: 프롬프트의 모든 자리의 K·V 를 셈해 캐시에 넣고 첫 토큰을 낸다.
 *   - 걸음 k ≥ 2: 걸음 k−1 이 낸 토큰 하나의 K·V 를 셈해 캐시에 붙이고 다음 토큰을 낸다.
 *   - 마지막에 낸 토큰의 K·V 는 셈하지 않는다 (더 낼 것이 없다).
 *   일반형: 걸음 k 가 보는 열의 길이는 프롬프트 + (k−1). 그중 캐시에 아직 없는 자리만 셈한다.
 *
 * 이벤트:
 *   init  (silent) payload { prompt: string[]; continuation: string[] }
 *         — 낱말 하나 = 토큰 하나. 프롬프트는 공백으로 가른다.
 *   feed           payload { k: number; from: number; count: number; emit: number }
 *         — 걸음 k. 열의 자리 from .. from+count−1 이 셈을 지나 캐시로 들어가고,
 *           이어진 낱말 continuation[emit] 을 낸다.
 *   done           payload { total: number }
 *         — 모든 걸음이 끝났다. total 은 걸음마다 셈한 자리의 합.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FirstTokenVsRestFacetData = {
  type: 'first-token-vs-rest';
  /** 소문자 영어 낱말을 공백 하나로 가른 프롬프트. */
  prompt: string;
  /** 예로 정한 이어짐 — 걸음마다 하나씩 낸다. */
  continuation: string[];
  stepMs: number;
};

export type FeedPayload = { k: number; from: number; count: number; emit: number };
export type InitPayload = { prompt: string[]; continuation: string[] };
export type DonePayload = { total: number };

export async function firstTokenVsRest(
  context: FacetContext<FirstTokenVsRestFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<FirstTokenVsRestFacetData>;
  const { stepMs } = ctx.data;
  const prompt = ctx.data.prompt.split(' ').filter((w) => w.length > 0);
  const continuation = [...ctx.data.continuation];

  /** 걸음 사이의 문. 첫 걸음 앞은 그냥 통과한다 — 마운트 직후 빈 화면을 두지 않는다. */
  async function pause(skip: boolean): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (skip) return true;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { prompt, continuation } satisfies InitPayload,
    silent: true,
  });

  let cached = 0;
  let total = 0;
  for (let k = 1; k <= continuation.length; k += 1) {
    if (!(await pause(k === 1))) return;
    // 이 걸음이 보는 열: 프롬프트 + 앞서 낸 k−1 개.
    const seen = prompt.length + (k - 1);
    const from = cached;
    const count = seen - cached;
    cached = seen;
    total += count;
    await ctx.emit({
      type: 'feed',
      payload: { k, from, count, emit: k - 1 } satisfies FeedPayload,
    });
  }

  if (!(await pause(false))) return;
  await ctx.emit({ type: 'done', payload: { total } satisfies DonePayload });
}
