/**
 * 언제나 1등만 — 탐욕 디코딩(greedy decoding) 조각의 알고리즘.
 *
 * 모형은 **예로 정한 것**이다. 실제 언어 모형이 낸 수가 아니다. 바로 앞 토큰 하나만 보고
 * 다음 토큰의 로짓을 내는 표(`logits[앞 토큰의 어휘 번호][후보 번호]`)가 전부다.
 *
 * 규약 (사양 그대로)
 * - 걸음마다 앞 토큰의 행에서 소프트맥스 `p_i = exp(z_i) / Σ_j exp(z_j)` (자연 지수,
 *   그 행 여섯 안에서 정규화. 최댓값을 빼고 셈한다 — 결과는 같다)
 * - 확률 1등을 고른다. 뽑기 없음. 동률이면 어휘 표에 먼저 적힌 후보가 이긴다
 * - 되풀이 판정 = 이번에 고른 토큰이 이미 문장에 있다 (프롬프트 포함)
 * - 끝 토큰 없음. `maxNew` 개를 만들면 멈춘다
 * - 반올림하지 않는다. 표시 자릿수는 stage 가 정한다
 *
 * 이벤트 (모두 silent 아님)
 * - `prompt` { token: string }
 *     문장의 첫 토큰(프롬프트)을 놓는다. 문 밖에서 곧바로 발신한다
 * - `pick`   { prev: string; token: string; p: number; second: string; secondP: number; firstAt: number }
 *     앞 토큰 `prev` 의 행에서 1등 `token`(확률 `p`)을 골라 문장 끝에 붙인다.
 *     `second`·`secondP` 는 그 행의 2등. `firstAt` 은 `token` 이 문장에 처음 있던 자리
 *     (0 부터, 프롬프트가 0). 처음 오는 토큰이면 -1
 * - `done`   { made: number; loopStart: number; loopEnd: number; rounds: number }
 *     길이로 멈췄다. `made` 는 만든 토큰 수. 처음 되풀이된 토큰의 자리가 `loopEnd`,
 *     그 토큰이 처음 있던 자리가 `loopStart` (고리 길이 = loopEnd − loopStart).
 *     `rounds` = loopStart 부터 문장 끝까지의 토큰 수 ÷ 고리 길이 (내림, 다 돈 바퀴만).
 *     고리 앞 토막은 세지 않는다. 되풀이가 없었으면 loopStart · loopEnd 는 -1, rounds 는 0
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AlwaysTheHighestFacetData = {
  type: 'always-the-highest';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 어휘. 로짓 표의 행 · 열 차례도 이 차례 */
  vocab: string[];
  /** `logits[i][j]` = 앞 토큰이 vocab[i] 일 때 다음 토큰 vocab[j] 의 로짓 */
  logits: number[][];
  /** 프롬프트 토큰 */
  prompt: string;
  /** 만들 토큰 수 */
  maxNew: number;
};

/** 한 행의 소프트맥스 — 그 행 안에서 정규화한다. */
function softmax(row: number[]): number[] {
  const top = Math.max(...row);
  const ex = row.map((z) => Math.exp(z - top));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / sum);
}

/** 확률 순위 — 큰 것부터. 동률이면 앞 번호가 이긴다 (안정 정렬). */
function rankOf(probs: number[]): number[] {
  return probs.map((_, i) => i).sort((a, b) => probs[b]! - probs[a]! || a - b);
}

export async function alwaysTheHighest(
  context: FacetContext<AlwaysTheHighestFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<AlwaysTheHighestFacetData>;
  const { vocab, logits, prompt, maxNew, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const sentence: string[] = [prompt];
  await ctx.emit({ type: 'prompt', payload: { token: prompt } });

  let loopStart = -1;
  let loopEnd = -1;

  for (let made = 0; made < maxNew; made += 1) {
    if (!(await pause())) return;
    const prev = sentence[sentence.length - 1]!;
    const row = logits[vocab.indexOf(prev)];
    if (!row) return;
    const probs = softmax(row);
    const [first, second] = rankOf(probs);
    const token = vocab[first!]!;
    const firstAt = sentence.indexOf(token);
    sentence.push(token);
    if (firstAt >= 0 && loopEnd < 0) {
      loopStart = firstAt;
      loopEnd = sentence.length - 1;
    }
    await ctx.emit({
      type: 'pick',
      payload: {
        prev,
        token,
        p: probs[first!]!,
        second: vocab[second!]!,
        secondP: probs[second!]!,
        firstAt,
      },
    });
  }

  if (!(await pause())) return;
  const rounds =
    loopEnd < 0 ? 0 : Math.floor((sentence.length - loopStart) / (loopEnd - loopStart));
  await ctx.emit({
    type: 'done',
    payload: { made: sentence.length - 1, loopStart, loopEnd, rounds },
  });
}
