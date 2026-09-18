/**
 * budget-runs-out — 찾아온 조각을 모형에 다 넣을 수 있는가.
 *
 * 맥락 창은 정해진 크기다. 지시문 · 질문 · 답 몫이 먼저 자리를 잡고, 남은 자리(조각 몫)로
 * 조각이 등수대로 들어간다. 누적이 조각 몫을 넘는 첫 조각에서 멈춘다 — 그 뒤는 보지 않는다.
 *
 * 토큰 수는 **공백으로 가른 낱말 수**로 친다 (구두점은 붙은 낱말에 딸린다). 실제 토크나이저가
 * 아니다 — 실제 토큰은 이보다 잘다. 수를 지어내지 않으려고 이 규약을 쓴다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   init    payload { window: number; answer: number; instruction: string; question: string;
 *                     chunks: { id: string; text: string }[] }
 *           바탕. 토큰 수는 싣지 않는다 — 장면이 `countTokens` 로 같은 셈을 한다
 *   seat    payload 없음. 지시문 · 질문 · 답 몫이 창에 앉는다
 *   admit   payload { rank: number }  (1 부터) 그 조각이 남은 자리에 들어간다
 *   reject  payload { rank: number }  (1 부터) 그 조각이 남은 자리보다 커서 밖에 남는다. 여기서 멈춘다
 *   tally   payload 없음. 담은 것 · 쓴 것 · 남은 것 · 다 담는 데 드는 몫을 센다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BudgetChunk = { id: string; text: string };

export type BudgetRunsOutFacetData = {
  type: 'budget-runs-out';
  stepMs: number;
  /** 맥락 창 크기 (토큰) */
  window: number;
  /** 답 몫 — 비워 두는 자리 (토큰) */
  answer: number;
  instruction: string;
  question: string;
  /** 등수 순서 (앞이 1위) */
  chunks: BudgetChunk[];
};

/** 토큰 수 = 공백으로 가른 낱말 수. 장면과 알고리즘이 같은 함수를 부른다. */
export function countTokens(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** 조각 몫 = 창 − 지시문 − 질문 − 답 몫. */
export function chunkBudget(window: number, answer: number, instruction: string, question: string): number {
  return window - countTokens(instruction) - countTokens(question) - answer;
}

export async function budgetRunsOut(ctx: FacetContext<BudgetRunsOutFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BudgetRunsOutFacetData>;
  const d = ctx.data;
  const stepMs = d.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 첫 걸음은 문 밖 — 마운트 직후 빈 화면을 두지 않는다
  await ctx.emit({
    type: 'init',
    payload: {
      window: d.window,
      answer: d.answer,
      instruction: d.instruction,
      question: d.question,
      chunks: d.chunks.map((c) => ({ id: c.id, text: c.text })),
    },
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'seat' });

  const budget = chunkBudget(d.window, d.answer, d.instruction, d.question);
  let used = 0;
  for (let i = 0; i < d.chunks.length; i += 1) {
    if (!(await pause())) return;
    const tokens = countTokens(d.chunks[i].text);
    if (used + tokens > budget) {
      await ctx.emit({ type: 'reject', payload: { rank: i + 1 } });
      break;
    }
    used += tokens;
    await ctx.emit({ type: 'admit', payload: { rank: i + 1 } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'tally' });
}
