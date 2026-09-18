/**
 * lost-in-the-middle — 같은 답 조각을 맥락의 앞 · 가운데 · 끝에 차례로 끼운다.
 *
 * 이 조각은 모형이 무엇을 놓치는지 **셈하지 않는다.** 가운데 것을 놓치기 쉽다는 것은
 * 실측 연구(Liu 외 2023, "Lost in the Middle")가 보고한 경향이지 여기서 나온 수가 아니다.
 * 셈하는 것은 자리뿐이다 — 답 조각의 자리 p (1 부터), 가까운 끝까지 거리
 * d = min(p − 1, n − p). 화면의 흐려짐은 d 의 단조 함수로만 정하는, 예로 보인 경향이다.
 *
 * 나머지 조각은 차례를 지킨 채 답 조각에 밀려 한 칸씩 옮긴다 (`orderWithAnswerAt`).
 *
 * 이벤트 (모두 걸음. silent 없음):
 *   place   payload { p: number }   답 조각을 자리 p 에 끼운다. p 는 1..n
 *   settle  payload 없음            끼워 본 자리를 견준다 (마지막 걸음)
 *
 * 차례 · 거리는 payload 에 싣지 않는다 — 장면이 아래 함수를 같은 바탕에 불러 셈한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ChunkEntry = { id: string; text: string };

export type LostInTheMiddleFacetData = {
  type: 'lost-in-the-middle';
  stepMs: number;
  /** 질문 (영어 자료. 번역하지 않는다) */
  question: string;
  /** 조각 일곱 — 식별자와 영어 글 */
  chunks: ChunkEntry[];
  /** 답 조각의 식별자 */
  answer: string;
  /** 답이 아닌 조각의 차례 */
  rest: string[];
  /** 답 조각을 끼울 자리들 (1 부터) */
  positions: number[];
};

/** 답 조각을 자리 p (1 부터) 에 끼운 맥락의 차례. 나머지는 차례를 지킨다. */
export function orderWithAnswerAt(rest: readonly string[], answer: string, p: number): string[] {
  const out = rest.slice(0, p - 1);
  out.push(answer);
  for (const id of rest.slice(p - 1)) out.push(id);
  return out;
}

/** 가까운 끝까지 거리 — d = min(p − 1, n − p). */
export function distanceToEnd(p: number, n: number): number {
  return Math.min(p - 1, n - p);
}

export async function lostInTheMiddle(
  context: FacetContext<LostInTheMiddleFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LostInTheMiddleFacetData>;
  const { stepMs, positions, rest } = ctx.data;
  const n = rest.length + 1;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let placed = 0;
  for (const p of positions) {
    if (ctx.cancelled) return;
    if (p < 1 || p > n || !Number.isInteger(p)) continue;
    // 첫 걸음은 문 없이 곧바로 — 마운트 직후 빈 화면을 두지 않는다
    if (placed > 0 && !(await pause())) return;
    await ctx.emit({ type: 'place', payload: { p } });
    placed += 1;
  }
  if (!(await pause())) return;
  await ctx.emit({ type: 'settle' });
}
