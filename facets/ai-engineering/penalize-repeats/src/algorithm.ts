/**
 * 되풀이 벌점 — 앞 문맥에 이미 나온 후보의 로짓을 깎고, 소프트맥스로 1등을 다시 고른다.
 *
 * 로짓은 모두 예로 정한 값이다. 실제 언어 모형이 낸 수가 아니다.
 *
 * 규약 (사양 그대로):
 *   - 앞 문맥을 공백으로 갈라 토큰을 얻는다 (소문자 그대로, 구두점 없음)
 *   - 한 번이라도 나온 후보면 벌점을 한 번 준다 (나온 횟수와 무관)
 *   - 벌점: 로짓 > 0 이면 로짓 ÷ θ, 로짓 ≤ 0 이면 로짓 × θ — 둘 다 값을 낮춘다
 *     (음수를 θ 로 나누면 0 쪽으로 올라가므로 부호로 가른다)
 *   - 벌점 뒤 후보 전부 안에서 소프트맥스(자연 지수), 1등을 고른다. 뽑기 없음
 *   - 동률이면 표에 먼저 적힌 후보가 이긴다
 *   - 반올림은 표시할 때만. 셈은 반올림하지 않은 값으로 끝까지
 *
 * 이벤트 (모두 silent 아님 — 하나하나가 걸음이다):
 *   init      { context: string[]; tokens: string[]; logits: number[]; theta: number; top: number }
 *             context 는 공백으로 가른 앞 문맥, tokens·logits 는 후보 표, top 은 벌점 전 1등 번호
 *   penalize  { i: number }
 *             후보 i 가 앞 문맥에 나왔다 — 그 로짓을 벌점 식으로 깎는다.
 *             깎인 값은 장면이 `penalized` 로 같은 식을 불러 얻는다
 *   pick      { i: number }
 *             벌점 뒤 소프트맥스의 1등 번호
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PenalizeRepeatsFacetData = {
  type: 'penalize-repeats';
  /** 앞 문맥 (자료 — 번역하지 않는다) */
  context: string;
  /** 다음 후보와 로짓. 예로 정한 값 */
  candidates: { token: string; logit: number }[];
  /** 벌점 θ (> 1) */
  theta: number;
  stepMs: number;
};

/** 앞 문맥을 공백으로 가른다. */
export function splitContext(context: string): string[] {
  return context.split(' ').filter((w) => w.length > 0);
}

/** 벌점 식 — 부호로 갈라 둘 다 값을 낮춘다. */
export function penalized(logit: number, theta: number): number {
  return logit > 0 ? logit / theta : logit * theta;
}

/** 거꾸로 짠 벌점 — 늘 나누기. 음수는 0 쪽으로 올라간다. 대조 그림에만 쓴다. */
export function dividedAlways(logit: number, theta: number): number {
  return logit / theta;
}

/** 소프트맥스 (자연 지수, 최댓값을 빼고 셈한다). */
export function softmax(logits: readonly number[]): number[] {
  if (logits.length === 0) return [];
  const m = Math.max(...logits);
  const ex = logits.map((z) => Math.exp(z - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
}

/** 1등 번호. 동률이면 먼저 적힌 쪽. */
export function argmax(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! > values[best]!) best = i;
  }
  return best;
}

export async function penalizeRepeats(
  rawCtx: FacetContext<PenalizeRepeatsFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<PenalizeRepeatsFacetData>;
  const { context, candidates, theta, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const words = splitContext(context);
  const seen = new Set(words);
  const tokens = candidates.map((c) => c.token);
  const logits = candidates.map((c) => c.logit);

  await ctx.emit({
    type: 'init',
    payload: {
      context: words,
      tokens,
      logits: [...logits],
      theta,
      top: argmax(softmax(logits)),
    },
  });

  const now = [...logits];
  for (let i = 0; i < tokens.length; i += 1) {
    if (ctx.cancelled) return;
    if (!seen.has(tokens[i]!)) continue;
    if (!(await pause())) return;
    now[i] = penalized(now[i]!, theta);
    await ctx.emit({ type: 'penalize', payload: { i } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'pick', payload: { i: argmax(softmax(now)) } });
}
