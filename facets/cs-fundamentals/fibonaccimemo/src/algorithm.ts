/**
 * Fibonacci Memoization — DP의 입문.
 *
 * 데이터: { type: 'integer', n }
 * 시각화: bar-chart에 memo[0..n] 테이블, 채워질 때마다 setData
 *
 * 이벤트:
 *   - state-changed (kind: 'memo', table: number[])
 *   - highlight (kind: 'visit' | 'hit')
 *   - mark (kind: 'computed' | 'result', value)
 *   - phase (kind: 'visit' | 'base' | 'hit' | 'compute')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type FibonacciMemoData = { type: 'integer'; n: number };

const UNCOMPUTED = -1;

export async function fibonaccimemo(ctx: FacetContext<FibonacciMemoData>): Promise<number> {
  const n = ctx.data.n;
  const memo = new Array(n + 1).fill(UNCOMPUTED);
  // table에는 0(uncomputed) 표시 — projector에서 -1을 보고 default로
  await ctx.emit({
    type: 'state-changed',
    target: 'memo',
    payload: { kind: 'memo', table: [...memo] },
  });

  async function rec(k: number): Promise<number> {
    if (ctx.cancelled) return 0;
    await ctx.emit({ type: 'phase', payload: { phase: 'visit' } });
    await ctx.emit({ type: 'highlight', target: `index:${k}`, payload: { kind: 'visit' } });
    ctx.metric('call-count', 'inc');

    if (k <= 1) {
      await ctx.emit({ type: 'phase', payload: { phase: 'base' } });
      memo[k] = k;
      await ctx.emit({
        type: 'state-changed',
        target: 'memo',
        payload: { kind: 'memo', table: [...memo] },
      });
      await ctx.emit({
        type: 'mark',
        target: `index:${k}`,
        payload: { kind: 'computed', value: k },
      });
      return k;
    }

    if (memo[k] !== UNCOMPUTED) {
      await ctx.emit({ type: 'phase', payload: { phase: 'hit' } });
      await ctx.emit({ type: 'highlight', target: `index:${k}`, payload: { kind: 'hit' } });
      ctx.metric('hit-count', 'inc');
      return memo[k];
    }

    await ctx.emit({ type: 'phase', payload: { phase: 'compute' } });
    const a = await rec(k - 1);
    if (ctx.cancelled) return 0;
    const b = await rec(k - 2);
    if (ctx.cancelled) return 0;
    memo[k] = a + b;
    await ctx.emit({
      type: 'state-changed',
      target: 'memo',
      payload: { kind: 'memo', table: [...memo] },
    });
    await ctx.emit({
      type: 'mark',
      target: `index:${k}`,
      payload: { kind: 'computed', value: memo[k] },
    });
    return memo[k];
  }

  const result = await rec(n);
  if (ctx.cancelled) return 0;
  await ctx.emit({ type: 'mark', target: 'result', payload: { kind: 'result', value: result } });
  await ctx.emit({ type: 'done' });
  return result;
}
