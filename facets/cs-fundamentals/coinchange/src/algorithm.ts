/**
 * CoinChange (Greedy) — 동전 단위 큰 것부터 욕심껏.
 *
 * 데이터: { type: 'coins', amount, coins } (coins는 내림차순)
 * 시각화: bar-chart는 동전 단위, 사용 카운트는 state-changed로 push
 *
 * 이벤트:
 *   - highlight (kind: 'try')  — 현재 시도 중인 동전 인덱스
 *   - unhighlight
 *   - state-changed (kind: 'used', index, count, remaining)
 *   - mark (kind: 'done', total)
 *   - phase (kind: 'try' | 'use' | 'next' | 'done')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type CoinChangeData = { type: 'coins'; amount: number; coins: number[] };

export async function coinchange(ctx: FacetContext<CoinChangeData>): Promise<number> {
  const coins = [...ctx.data.coins].sort((a, b) => b - a);
  let remaining = ctx.data.amount;
  let total = 0;
  const counts = new Array(coins.length).fill(0);

  await ctx.emit({
    type: 'state-changed',
    target: 'remaining',
    payload: { kind: 'remaining', value: remaining },
  });

  for (let i = 0; i < coins.length; i++) {
    if (ctx.cancelled) return 0;
    await ctx.emit({ type: 'phase', payload: { phase: 'try' }, silent: true });
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'try' } });
    ctx.metric('try-count', 'inc');

    while (remaining >= coins[i]) {
      if (ctx.cancelled) return 0;
      await ctx.emit({ type: 'phase', payload: { phase: 'use' }, silent: true });
      remaining -= coins[i];
      counts[i]++;
      total++;
      ctx.metric('coin-count', 'inc');
      await ctx.emit({
        type: 'state-changed',
        target: `index:${i}`,
        payload: { kind: 'used', index: i, count: counts[i], remaining, total },
      });
    }

    if (counts[i] > 0) {
      await ctx.emit({
        type: 'mark',
        target: `index:${i}`,
        payload: { kind: 'used', count: counts[i] },
      });
    } else {
      await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
    }

    if (remaining === 0) break;
    await ctx.emit({ type: 'phase', payload: { phase: 'next' }, silent: true });
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'done' }, silent: true });
  await ctx.emit({
    type: 'mark',
    target: 'result',
    payload: { kind: 'done', total, remaining },
  });
  await ctx.emit({ type: 'done' });
  return total;
}
