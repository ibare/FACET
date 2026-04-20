/**
 * SelectionSort 알고리즘 — 매 패스마다 최솟값을 찾아 맨 앞과 교환.
 *
 * 식별자: `index:<n>`
 * 이벤트:
 *   - highlight (kind: 'compare' | 'min')
 *   - state-changed (kind: 'swap', i, j)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'pass-start' | 'compare' | 'update-min' | 'swap')
 *   - done
 *
 * 메트릭: 'compare-count', 'swap-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type SelectionSortData = { type: 'array'; values: number[] };

export async function selectionsort(ctx: FacetContext<SelectionSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  for (let i = 0; i < n - 1; i++) {
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'phase', payload: { phase: 'pass-start' } });

    let minIdx = i;
    await ctx.emit({ type: 'highlight', target: `index:${minIdx}`, payload: { kind: 'min' } });

    for (let j = i + 1; j < n; j++) {
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'phase', payload: { phase: 'compare' } });
      await ctx.emit({ type: 'highlight', target: `index:${j}`, payload: { kind: 'compare' } });
      ctx.metric('compare-count', 'inc');

      if (arr[j] < arr[minIdx]) {
        await ctx.emit({ type: 'phase', payload: { phase: 'update-min' } });
        await ctx.emit({ type: 'unhighlight', target: `index:${minIdx}` });
        minIdx = j;
        await ctx.emit({ type: 'highlight', target: `index:${minIdx}`, payload: { kind: 'min' } });
      } else {
        await ctx.emit({ type: 'unhighlight', target: `index:${j}` });
      }
    }

    if (minIdx !== i) {
      await ctx.emit({ type: 'phase', payload: { phase: 'swap' } });
      [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${i}`, `index:${minIdx}`],
        payload: { kind: 'swap', i, j: minIdx },
      });
      ctx.metric('swap-count', 'inc');
    }

    await ctx.emit({ type: 'unhighlight', target: `index:${minIdx}` });
    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });
  }

  if (!ctx.cancelled && n > 0) {
    await ctx.emit({ type: 'mark', target: `index:${n - 1}`, payload: { kind: 'sorted' } });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}
