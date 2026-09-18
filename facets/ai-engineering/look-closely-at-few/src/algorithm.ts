/**
 * 몇 개만 다시 보기 — 1차 등수의 앞 N 개만 재순위에 넘기고, 그 넷끼리 자리를 바꾼다.
 *
 * **점수는 둘 다 예로 정한 값이다.** 1차 점수와 재순위 점수 모두 어떤 모형의 출력도
 * 아니다. 재순위 점수는 앞 N 개에만 있다 — 나머지는 셈하지 않았다는 것이 곧 사실이라
 * 자료에도 두지 않는다. 알고리즘은 문턱 안의 후보에만 재순위 점수를 찾아본다.
 *
 * 규약
 *   1차 등수   1차 점수 내림차순. 같으면 식별자 오름차순
 *   문턱       앞 N 개만 재순위에 넘긴다
 *   재순위     재순위 점수 내림차순. 같으면 식별자 오름차순 (이 자료에서는 둘 다 걸리지 않는다)
 *   최종 줄    재순위한 N 개 뒤에 나머지가 1차 차례대로
 *
 * 발신 이벤트 (모두 걸음이다. silent 없음)
 *   init     { query: string; candidates: { id; text; first }[]; order: string[]; n: number }
 *            order 는 1차 등수 차례의 식별자
 *   cut      { picked: string[] }            문턱을 넘는 앞 N 개 (1차 차례)
 *   score    { id: string; score: number }   한 후보를 질의와 맞대어 본 재순위 점수
 *   reorder  { order: string[] }             재순위 차례로 다시 선 N 개
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LookCloselyAtFewCandidate = {
  id: string;
  /** 후보 조각의 글 (자료 — 번역하지 않는다). */
  text: string;
  /** 예로 정한 1차 점수 0~100. */
  first: number;
};

export type LookCloselyAtFewFacetData = {
  type: 'look-closely-at-few';
  query: string;
  candidates: LookCloselyAtFewCandidate[];
  /** 예로 정한 재순위 점수. 문턱 안의 후보에만 있다. */
  rerank: Record<string, number>;
  /** 재순위에 넘기는 수. */
  n: number;
  stepMs: number;
};

/** 점수 내림차순, 같으면 식별자 오름차순. */
function byScoreThenId(score: (id: string) => number) {
  return (a: string, b: string): number => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

export async function lookCloselyAtFew(
  ctx: FacetContext<LookCloselyAtFewFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<LookCloselyAtFewFacetData>;
  const { query, candidates, rerank, n, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const firstOf = new Map(candidates.map((c) => [c.id, c.first]));
  const order = candidates
    .map((c) => c.id)
    .sort(byScoreThenId((id) => firstOf.get(id) ?? 0));

  // 첫 걸음은 문 밖에 둔다 — 마운트 직후 빈 화면을 두지 않는다.
  await ctx.emit({
    type: 'init',
    payload: {
      query,
      candidates: candidates.map((c) => ({ id: c.id, text: c.text, first: c.first })),
      order,
      n,
    },
  });
  if (!(await pause())) return;

  const picked = order.slice(0, n);
  await ctx.emit({ type: 'cut', payload: { picked } });

  // 문턱 안의 후보만 하나씩 질의와 맞대어 본다. 문턱 밖은 여기 들어오지 않는다.
  const scored = new Map<string, number>();
  for (const id of picked) {
    if (!(await pause())) return;
    const score = rerank[id];
    if (score === undefined) throw new Error(`look-closely-at-few: ${id} 의 재순위 점수가 자료에 없다`);
    scored.set(id, score);
    await ctx.emit({ type: 'score', payload: { id, score } });
  }

  if (!(await pause())) return;
  const reordered = [...picked].sort(byScoreThenId((id) => scored.get(id) ?? 0));
  await ctx.emit({ type: 'reorder', payload: { order: reordered } });
}
