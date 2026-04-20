/**
 * 더미 counter 알고리즘 — 1부터 target 까지 세는 단순 알고리즘.
 * 검증/회귀 테스트용 (프로덕션 코드 아님).
 */

import type { FacetContext } from '../../runtime/context.js';

export type CounterData = { target: number; current?: number };

export async function counter(ctx: FacetContext<CounterData>): Promise<void> {
  const target = ctx.data.target;
  for (let i = 1; i <= target; i++) {
    if (ctx.cancelled) return;
    ctx.data.current = i;
    await ctx.emit({ type: 'state-changed', payload: { value: i } });
    ctx.metric('count', 'inc');
  }
  await ctx.emit({ type: 'done' });
}
