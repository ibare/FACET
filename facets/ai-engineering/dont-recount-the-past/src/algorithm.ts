/**
 * 다시 세지 않기 — 토큰을 하나 더 낼 때 앞 토큰들의 K·V 를 다시 셈하는가.
 *
 * 두 방식이 같은 걸음을 나란히 밟는다. 걸음 k 는 길이 `prompt.length + k − 1` 인 열을
 * 보고 다음 토큰 하나를 낸다.
 *   - 캐시 없음: 그 걸음에 열의 모든 자리의 K·V 를 셈한다.
 *   - 캐시: 캐시에 아직 없는 자리만 셈하고, 셈한 것을 캐시 끝에 붙인다.
 * 셈의 단위는 "K·V 자리" (자리 하나의 K 와 V 를 셈하는 일 한 번). 층 · 머리는 두 쪽에
 * 같은 곱수라 세지 않는다.
 *
 * 이벤트 (모두 걸음 경계, silent 없음):
 *   init  payload { prompt: string[]; continuation: string[] }
 *         처음 들어온 토큰들과 이어서 낼 토큰들. 낱말 하나 = 토큰 하나.
 *   step  payload { k: number; recount: number[]; fresh: number[]; produced: number }
 *         k        걸음 번호 (1 부터)
 *         recount  캐시 없는 쪽이 이 걸음에 셈한 자리 (0 부터 센 자리 번호, 오름차순)
 *         fresh    캐시 쪽이 이 걸음에 셈한 자리 (캐시에 없던 것만)
 *         produced 이 걸음이 낸 토큰의 자리 (0 부터)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DontRecountThePastFacetData = {
  type: 'dont-recount-the-past';
  /** 처음 들어온 토큰들 */
  prompt: string[];
  /** 이어서 낼 토큰들 — 예로 정한 이어짐이다 */
  continuation: string[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export async function dontRecountThePast(
  rawCtx: FacetContext<DontRecountThePastFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<DontRecountThePastFacetData>;
  const prompt = [...ctx.data.prompt];
  const continuation = [...ctx.data.continuation];
  const stepMs = ctx.data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { prompt, continuation } });

  // 캐시에 들어 있는 자리 — 셈한 차례대로 끝에 붙는다
  const cache: number[] = [];

  for (let k = 1; k <= continuation.length; k += 1) {
    if (!(await pause())) return;

    const seqLen = prompt.length + k - 1;

    // 캐시 없음: 열의 모든 자리
    const recount: number[] = [];
    for (let p = 0; p < seqLen; p += 1) {
      if (ctx.cancelled) return;
      recount.push(p);
    }

    // 캐시: 캐시에 아직 없는 자리만
    const fresh: number[] = [];
    for (let p = 0; p < seqLen; p += 1) {
      if (ctx.cancelled) return;
      if (!cache.includes(p)) fresh.push(p);
    }
    cache.push(...fresh);

    await ctx.emit({ type: 'step', payload: { k, recount, fresh, produced: seqLen } });
  }
}
