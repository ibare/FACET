/**
 * ArrayMax — 분할 정복으로 배열 최댓값.
 *
 *   max(arr, lo, hi):
 *     if lo == hi: return arr[lo]
 *     mid = (lo + hi) / 2
 *     L = max(arr, lo, mid)
 *     R = max(arr, mid+1, hi)
 *     return max(L, R)
 *
 * 데이터: { type: 'array', values }
 * 이벤트:
 *   - highlight (kind: 'range' | 'base' | 'winner')
 *   - unhighlight
 *   - mark (kind: 'result', value)
 *   - phase (kind: 'split' | 'base' | 'combine')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type ArrayMaxData = { type: 'array'; values: number[] };

export async function arraymax(ctx: FacetContext<ArrayMaxData>): Promise<number> {
  const arr = ctx.data.values;
  if (arr.length === 0) {
    await ctx.emit({ type: 'phase', payload: { phase: 'base' } });
    await ctx.emit({ type: 'done' });
    return -Infinity;
  }

  async function rec(lo: number, hi: number): Promise<number> {
    if (ctx.cancelled) return 0;
    const ids: string[] = [];
    for (let k = lo; k <= hi; k++) ids.push(`index:${k}`);
    await ctx.emit({ type: 'highlight', target: ids, payload: { kind: 'range' } });
    ctx.metric('call-count', 'inc');

    if (lo === hi) {
      await ctx.emit({ type: 'phase', payload: { phase: 'base' } });
      await ctx.emit({
        type: 'highlight',
        target: `index:${lo}`,
        payload: { kind: 'base' },
      });
      await ctx.emit({ type: 'unhighlight', target: ids });
      return arr[lo];
    }

    await ctx.emit({ type: 'phase', payload: { phase: 'split' } });
    const mid = (lo + hi) >> 1;
    const L = await rec(lo, mid);
    if (ctx.cancelled) return 0;
    const R = await rec(mid + 1, hi);
    if (ctx.cancelled) return 0;

    await ctx.emit({ type: 'phase', payload: { phase: 'combine' } });
    const winner = L >= R ? L : R;
    ctx.metric('compare-count', 'inc');
    await ctx.emit({ type: 'unhighlight', target: ids });
    return winner;
  }

  const result = await rec(0, arr.length - 1);
  if (ctx.cancelled) return 0;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === result) {
      await ctx.emit({
        type: 'mark',
        target: `index:${i}`,
        payload: { kind: 'result', value: result },
      });
      break;
    }
  }
  await ctx.emit({ type: 'done' });
  return result;
}
