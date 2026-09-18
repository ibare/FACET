/**
 * flatten-or-sharpen — 온도는 다음 토큰의 확률에 무엇을 하는가.
 *
 * 문맥 하나와 후보 다섯의 로짓이 주어진다. 로짓은 **예로 정한 값**이다 — 실제 언어
 * 모형이 낸 수가 아니다. 온도를 정해진 차례로 바꿔 가며, 온도마다 확률 분포를 셈한다.
 *
 * 규약 (사양 그대로):
 *   - 로짓을 온도로 **나눈 뒤** 표의 후보 다섯 안에서 소프트맥스 (자연 지수).
 *     최댓값을 빼고 셈한다 — 결과는 같다
 *   - 뽑기는 없다. 이 조각은 확률의 모양만 말한다
 *   - 반올림은 표시할 때만. 여기서는 반올림하지 않은 값을 싣는다
 *   - 줄 세우기의 동률은 표에 먼저 적힌 후보가 이긴다
 *
 * 이벤트:
 *   init    (silent)  { context: string; tokens: string[]; logits: number[] }
 *   temper            { index: number; t: number; probs: number[]; rank: number[] }
 *                       probs — 표 차례의 확률. rank — 확률이 큰 차례로 늘어놓은 후보 번호
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FlattenOrSharpenFacetData = {
  type: 'flatten-or-sharpen';
  /** 다음 토큰을 기다리는 문맥 — 자료라 번역하지 않는다 */
  context: string;
  /** 후보와 로짓, 표의 차례 */
  candidates: { token: string; logit: number }[];
  /** 거쳐 갈 온도, 이 차례로 */
  temperatures: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 로짓을 온도로 나눈 뒤 소프트맥스. */
function softmaxAt(logits: readonly number[], t: number): number[] {
  const scaled = logits.map((z) => z / t);
  const top = Math.max(...scaled);
  const weights = scaled.map((s) => Math.exp(s - top));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

/** 확률이 큰 차례. 같으면 표에 먼저 적힌 후보가 앞. */
function rankOf(probs: readonly number[]): number[] {
  return probs
    .map((_, i) => i)
    .sort((a, b) => (probs[b] !== probs[a] ? probs[b] - probs[a] : a - b));
}

export async function flattenOrSharpen(
  base: FacetContext<FlattenOrSharpenFacetData>,
): Promise<void> {
  const ctx = base as ReactiveContext<FlattenOrSharpenFacetData>;
  const { context, candidates, temperatures, stepMs } = ctx.data;
  const logits = candidates.map((c) => c.logit);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { context, tokens: candidates.map((c) => c.token), logits },
    silent: true,
  });

  for (let index = 0; index < temperatures.length; index += 1) {
    if (ctx.cancelled) return;
    // 첫 온도는 문 밖에 둔다 — 마운트 직후 빈 화면으로 머물지 않게
    if (index > 0 && !(await pause())) return;
    const t = temperatures[index];
    const probs = softmaxAt(logits, t);
    await ctx.emit({
      type: 'temper',
      payload: { index, t, probs, rank: rankOf(probs) },
    });
  }
}
