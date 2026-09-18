/**
 * erase-the-impossible — 문법 제약 디코딩. 고르기 **전에** 문법이 허락하지 않는 후보를 지운다.
 *
 * 로짓은 모두 예로 정한 값이다. 실제 언어 모형에서 나온 수가 아니다.
 *
 * 규약 (사양 그대로):
 *   - 목표 문법은 토큰 열 `{` `"age"` `:` `<정수>` `}`. `<정수>` 는 수 토큰 **하나** —
 *     수 토큰을 이어 붙인 수는 이 문법에 없다. 그래서 `42` 다음 자리에서는 `}` 만 허용된다
 *   - 허용 집합은 문법이 정한다. 이미 나온 토큰 수가 곧 문법에서 채울 자리의 번호다
 *   - 지운 후보는 로짓을 −∞ 로 둔 것과 같다 → **남은 후보 안에서** 소프트맥스 (자연 지수)
 *   - 고르기는 1등 (뽑기 없음). 동률이면 어휘에 먼저 적힌 후보가 이긴다
 *   - 반올림은 표시할 때만 — 여기서는 반올림하지 않는다
 *
 * 이벤트 (전부 silent 아님 — 걸음마다 하나):
 *   'offer'  payload { d: number }                결정 d 의 후보 여섯을 전체 소프트맥스로 보인다
 *   'erase'  payload { d: number }                결정 d 에서 문법이 허락하지 않는 후보를 지운다
 *   'pick'   payload { d: number; index: number } 남은 후보 가운데 1등(어휘 번호 index)을 출력에 붙인다
 *
 * 확률 · 허용 집합 · 모형의 1등은 바탕(initialData)에서 결정되므로 payload 에 싣지 않는다.
 * 장면이 여기의 같은 함수(`decisionOf`)를 불러 셈한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 문법 자리 하나 — 글자 그대로의 토큰이거나 `<int>`(수 토큰 하나). */
export type GrammarSlot = string;

/** 문법에서 "수 토큰 하나" 자리를 뜻하는 표식. 화면 이름은 messages 의 label.int. */
export const INT_SLOT = '<int>';

export type EraseTheImpossibleFacetData = {
  type: 'erase-the-impossible';
  /** 목표 문법 — 토큰 열. */
  grammar: GrammarSlot[];
  /** 이미 나온 토큰. */
  prefix: string[];
  /** 어휘 (자료, 번역하지 않는다). */
  vocab: string[];
  /** 결정마다 어휘 차례의 로짓. 결정 d 는 prefix 뒤 d 번째 자리를 채운다. */
  logits: number[][];
  stepMs: number;
};

/** 결정 하나를 셈한 것. */
export type Decision = {
  /** 문법에서 채울 자리의 번호. */
  slot: number;
  /** 어휘 전부의 소프트맥스. */
  full: number[];
  /** 문법이 허락하는가. */
  allowed: boolean[];
  /** 남은 후보 안에서의 소프트맥스 — 지운 후보는 0. */
  kept: number[];
  /** 지운 후보의 전체 확률 합. */
  erasedMass: number;
  /** 지우지 않았다면 고를 후보 (모형의 1등). */
  top: number;
  /** 지운 뒤 고르는 후보. 허용 후보가 없으면 -1. */
  pick: number;
};

/** 토큰이 문법 자리에 맞는가. `<int>` 자리는 수 토큰 하나만 받는다. */
export function fits(slot: GrammarSlot | undefined, token: string): boolean {
  if (slot === undefined) return false;
  if (slot === INT_SLOT) return /^-?\d+$/.test(token);
  return slot === token;
}

/** 고른 번호들 안에서의 소프트맥스. 고르지 않은 번호는 0. 최댓값을 빼고 셈한다. */
export function softmaxOver(logits: readonly number[], keep: readonly boolean[]): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i += 1) {
    if (keep[i] && (logits[i] as number) > max) max = logits[i] as number;
  }
  if (max === -Infinity) return logits.map(() => 0);
  const ex = logits.map((z, i) => (keep[i] ? Math.exp(z - max) : 0));
  let sum = 0;
  for (const e of ex) sum += e;
  return ex.map((e) => e / sum);
}

/** 가장 큰 값의 번호. 동률이면 앞 번호가 이긴다. 모두 0 이하 후보가 없으면 -1. */
export function argmax(values: readonly number[], keep: readonly boolean[]): number {
  let best = -1;
  for (let i = 0; i < values.length; i += 1) {
    if (!keep[i]) continue;
    if (best < 0 || (values[i] as number) > (values[best] as number)) best = i;
  }
  return best;
}

/** 결정 d 를 셈한다 — 전체 소프트맥스 · 허용 · 남은 것 안의 소프트맥스 · 두 1등. */
export function decisionOf(data: EraseTheImpossibleFacetData, d: number): Decision {
  const logits = data.logits[d] ?? [];
  const slot = data.prefix.length + d;
  const all = data.vocab.map(() => true);
  const allowed = data.vocab.map((tok) => fits(data.grammar[slot], tok));
  const full = softmaxOver(logits, all);
  const kept = softmaxOver(logits, allowed);
  let erasedMass = 0;
  for (let i = 0; i < full.length; i += 1) if (!allowed[i]) erasedMass += full[i] as number;
  return {
    slot,
    full,
    allowed,
    kept,
    erasedMass,
    top: argmax(full, all),
    pick: argmax(kept, allowed),
  };
}

export async function eraseTheImpossible(
  ctxBase: FacetContext<EraseTheImpossibleFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<EraseTheImpossibleFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let d = 0; d < data.logits.length; d += 1) {
    if (ctx.cancelled) return;
    // 첫 걸음 앞에는 빈 화면을 두지 않는다 — 첫 문만 그냥 통과한다
    if (d > 0 && !(await pause())) return;
    await ctx.emit({ type: 'offer', payload: { d } });
    if (!(await pause())) return;
    await ctx.emit({ type: 'erase', payload: { d } });
    if (!(await pause())) return;
    const { pick } = decisionOf(data, d);
    if (pick < 0) return;
    await ctx.emit({ type: 'pick', payload: { d, index: pick } });
  }
  // 마지막 걸음도 머문다 — 벽시계가 다른 걸음과 같게
  await pause();
}
