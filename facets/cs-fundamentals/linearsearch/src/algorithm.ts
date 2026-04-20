/**
 * LinearSearch — 선두부터 순차 비교.
 *
 * 데이터: { type: 'array', values, target }
 * 이벤트:
 *   - highlight (kind: 'probe')
 *   - mark (kind: 'found' | 'not-found')
 *   - unhighlight
 *   - phase (kind: 'compare' | 'found' | 'end')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type LinearSearchData = { type: 'array'; values: number[]; target: number };

export async function linearsearch(ctx: FacetContext<LinearSearchData>): Promise<number> {
  const arr = ctx.data.values;
  const target = ctx.data.target;
  const n = arr.length;

  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return -1;
    await ctx.emit({ type: 'phase', payload: { phase: 'compare' } });
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'probe' } });
    ctx.metric('probe-count', 'inc');

    if (arr[i] === target) {
      await ctx.emit({ type: 'phase', payload: { phase: 'found' } });
      await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'found' } });
      await ctx.emit({ type: 'done' });
      return i;
    }

    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'end' } });
  await ctx.emit({ type: 'mark', target: 'result', payload: { kind: 'not-found' } });
  await ctx.emit({ type: 'done' });
  return -1;
}
