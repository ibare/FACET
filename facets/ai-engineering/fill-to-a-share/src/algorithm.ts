/**
 * fill-to-a-share — top-p 는 왜 문맥마다 남기는 후보 수가 다른가.
 *
 * 로짓은 **예로 정한 값**이다. 실제 언어 모형이 낸 수가 아니다.
 *
 * 규약 (사양 그대로):
 *   - 문맥마다 후보 여덟 안에서 소프트맥스 `p_i = exp(z_i) / Σ_j exp(z_j)` (자연 지수,
 *     최댓값을 빼고 셈한다 — 결과는 같다)
 *   - 확률 큰 차례로 하나씩 더해, 누적이 처음으로 **p 이상 (≥ p)** 이 되는 후보까지 넣는다.
 *     넘긴 그 후보도 남는다. 뽑기 없음
 *   - 동률이면 표에 먼저 적힌 후보가 앞선다 (이 데이터에서는 일어나지 않는다)
 *   - 두 문맥을 차례로 (표 순서, `peaked` 먼저). 끝에 견줄 k 로 top-k 였다면의 누적을 셈한다
 *   - 셈은 반올림하지 않는다. 반올림은 표시할 때만 (stage)
 *
 * 이벤트 (init 만 silent, 나머지는 걸음):
 *   init    { p: number; k: number; contexts: { id: string; sentence: string;
 *             ranked: { token: string; logit: number; prob: number }[] }[] }   silent
 *           — 바탕. ranked 는 확률 큰 차례
 *   show    { c: number }                                  c 번째 문맥을 내놓는다
 *   pour    { c: number; i: number; cum: number; reached: boolean }
 *           — c 문맥의 i 번째(확률 차례) 후보를 담는다. cum 은 담은 뒤 누적,
 *             reached 는 cum ≥ p 라서 담기가 여기서 멈추는가
 *   compare { k: number; fills: number[] }                 top-k 였다면 문맥마다 찼을 누적
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FillToAShareCandidate = { token: string; logit: number };
export type FillToAShareContext = { id: string; sentence: string; candidates: FillToAShareCandidate[] };

export type FillToAShareFacetData = {
  type: 'fill-to-a-share';
  stepMs: number;
  p: number;
  k: number;
  contexts: FillToAShareContext[];
};

type Ranked = { token: string; logit: number; prob: number };

/** 표 안에서 소프트맥스를 셈하고 확률 큰 차례로 세운다. 동률이면 표 순서가 앞선다. */
function rank(candidates: FillToAShareCandidate[]): Ranked[] {
  const max = Math.max(...candidates.map((c) => c.logit));
  const exps = candidates.map((c) => Math.exp(c.logit - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const withProb = candidates.map((c, idx) => ({
    token: c.token,
    logit: c.logit,
    prob: exps[idx]! / sum,
    order: idx,
  }));
  withProb.sort((a, b) => (b.prob === a.prob ? a.order - b.order : b.prob - a.prob));
  return withProb.map(({ token, logit, prob }) => ({ token, logit, prob }));
}

export async function fillToAShare(context: FacetContext<FillToAShareFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<FillToAShareFacetData>;
  const { stepMs, p, k, contexts } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const rankedAll = contexts.map((c) => rank(c.candidates));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      p,
      k,
      contexts: contexts.map((c, idx) => ({ id: c.id, sentence: c.sentence, ranked: rankedAll[idx] })),
    },
  });

  for (let c = 0; c < rankedAll.length; c += 1) {
    if (ctx.cancelled) return;
    // 첫 문맥은 마운트 직후 곧바로 보인다 — 첫 걸음 앞에 빈 화면을 두지 않는다.
    if (c > 0 && !(await pause())) return;
    await ctx.emit({ type: 'show', payload: { c } });

    const ranked = rankedAll[c]!;
    let cum = 0;
    for (let i = 0; i < ranked.length; i += 1) {
      if (!(await pause())) return;
      cum += ranked[i]!.prob;
      const reached = cum >= p;
      await ctx.emit({ type: 'pour', payload: { c, i, cum, reached } });
      if (reached) break;
    }
  }

  if (!(await pause())) return;
  const fills = rankedAll.map((ranked) =>
    ranked.slice(0, k).reduce((acc, r) => acc + r.prob, 0),
  );
  await ctx.emit({ type: 'compare', payload: { k, fills } });
}
