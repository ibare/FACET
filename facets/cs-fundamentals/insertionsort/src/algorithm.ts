/**
 * InsertionSort 알고리즘 — 정렬된 접두부에 현재 원소를 삽입.
 *
 * 이벤트:
 *   - highlight (kind: 'current' | 'compare')
 *   - state-changed (kind: 'shift', from, to) | (kind: 'insert', at)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'pick' | 'compare' | 'shift' | 'insert')
 *   - done
 *
 * 메트릭: 'compare-count', 'shift-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type InsertionSortData = { type: 'array'; values: number[] };

export async function insertionsort(ctx: FacetContext<InsertionSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  if (n > 0) {
    await ctx.emit({ type: 'mark', target: 'index:0', payload: { kind: 'sorted' } });
  }

  for (let i = 1; i < n; i++) {
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'phase', payload: { phase: 'pick' }, silent: true });
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'current' } });

    const key = arr[i];
    let j = i - 1;

    while (j >= 0) {
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'phase', payload: { phase: 'compare' }, silent: true });
      await ctx.emit({ type: 'highlight', target: `index:${j}`, payload: { kind: 'compare' } });
      ctx.metric('compare-count', 'inc');

      if (arr[j] > key) {
        await ctx.emit({ type: 'phase', payload: { phase: 'shift' }, silent: true });
        arr[j + 1] = arr[j];
        await ctx.emit({
          type: 'state-changed',
          target: [`index:${j}`, `index:${j + 1}`],
          payload: { kind: 'shift', from: j, to: j + 1 },
        });
        ctx.metric('shift-count', 'inc');
        await ctx.emit({ type: 'unhighlight', target: `index:${j}` });
        j--;
      } else {
        await ctx.emit({ type: 'unhighlight', target: `index:${j}` });
        break;
      }
    }

    await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
    arr[j + 1] = key;
    await ctx.emit({
      type: 'state-changed',
      target: `index:${j + 1}`,
      payload: { kind: 'insert', at: j + 1, value: key },
    });
    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}
