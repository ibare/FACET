/**
 * cut-the-tail — top-k 는 무엇을 버리고 무엇에서 뽑는가.
 *
 * 로짓은 **예로 정한 값**이다. 실제 언어 모형이 낸 수가 아니다.
 *
 * 규약 (사양 그대로):
 *   - 확률 = 후보 전부 안에서 소프트맥스 `p_i = exp(z_i) / Σ exp(z_j)` (자연 지수, 최댓값을 빼고 셈한다)
 *   - 확률 큰 차례로 k 개를 남긴다. 동률이면 표에 먼저 적힌 후보가 앞선다
 *   - 남은 k 개는 **남은 것 안에서 다시 소프트맥스** — 전체 확률을 남은 몫의 합으로 나눈 것과 같다
 *   - 뽑기: 남은 것을 확률 큰 차례로 누적해, 누적이 처음으로 u 를 **넘는**(> u) 후보.
 *     u 는 데이터로 정한 수다. 난수를 쓰지 않는다
 *   - 셈은 반올림하지 않은 값으로 끝까지 한다. 반올림은 그림이 표시할 때만
 *
 * 이벤트 (전부 silent 아님, 한 번씩 이 차례로):
 *   init          { context: string; tokens: string[]; logits: number[];
 *                   probs: number[];   // 후보마다 전체 소프트맥스 확률 (표의 차례)
 *                   order: number[];   // 확률 큰 차례의 후보 번호
 *                   k: number; u: number }
 *   cut           { kept: number[];    // 남긴 후보 번호 (확률 큰 차례)
 *                   dropped: number[]; // 버린 후보 번호 (확률 큰 차례)
 *                   droppedMass: number } // 버린 몫의 합
 *   renormalize   { probs: number[];   // 남은 것 안의 확률 (표의 차례, 버린 후보는 0)
 *                   gained: number[] } // 후보마다 새로 붙은 몫 (표의 차례, 버린 후보는 0)
 *   draw          { u: number;
 *                   cumulative: number[]; // kept 차례의 누적
 *                   picked: number }      // 뽑힌 후보 번호
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CutTheTailFacetData = {
  type: 'cut-the-tail';
  /** 이어 쓸 문맥 문장 (자료 — 번역하지 않는다) */
  context: string;
  /** 후보 토큰과 로짓. 로짓은 예로 정한 값이다 */
  candidates: ReadonlyArray<{ token: string; logit: number }>;
  /** 남길 후보 수 */
  k: number;
  /** 데이터로 정한 뽑기 값 (0 이상 1 미만) */
  u: number;
  stepMs: number;
};

function softmax(logits: readonly number[]): number[] {
  const max = Math.max(...logits);
  const ex = logits.map((z) => Math.exp(z - max));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / sum);
}

export async function cutTheTail(ctx: FacetContext<CutTheTailFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CutTheTailFacetData>;
  const { context, candidates, k, u, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const tokens = candidates.map((c) => c.token);
  const logits = candidates.map((c) => c.logit);
  const probs = softmax(logits);
  // 확률 큰 차례. 동률이면 번호가 작은(표에 먼저 적힌) 후보가 앞선다
  const order = probs
    .map((_, i) => i)
    .sort((a, b) => (probs[b] - probs[a] !== 0 ? probs[b] - probs[a] : a - b));

  await ctx.emit({ type: 'init', payload: { context, tokens, logits, probs, order, k, u } });
  if (!(await pause())) return;

  const kept = order.slice(0, k);
  const dropped = order.slice(k);
  const droppedMass = dropped.reduce((s, i) => s + probs[i], 0);
  await ctx.emit({ type: 'cut', payload: { kept, dropped, droppedMass } });
  if (!(await pause())) return;

  // 남은 것 안에서 다시 소프트맥스
  const keptProbs = softmax(kept.map((i) => logits[i]));
  const renorm = probs.map(() => 0);
  kept.forEach((i, j) => {
    renorm[i] = keptProbs[j];
  });
  const gained = probs.map((p, i) => (renorm[i] > 0 ? renorm[i] - p : 0));
  await ctx.emit({ type: 'renormalize', payload: { probs: renorm, gained } });
  if (!(await pause())) return;

  // 누적이 처음으로 u 를 넘는 후보
  const cumulative: number[] = [];
  let acc = 0;
  let picked = kept[kept.length - 1];
  let found = false;
  for (const i of kept) {
    if (ctx.cancelled) return;
    acc += renorm[i];
    cumulative.push(acc);
    if (!found && acc > u) {
      picked = i;
      found = true;
    }
  }
  await ctx.emit({ type: 'draw', payload: { u, cumulative, picked } });
}
