/**
 * ShellSort 알고리즘 — gap 시퀀스(n/2, n/4, ..., 1) 로 gap-인서션.
 *
 * 이벤트:
 *   - highlight (kind: 'current' | 'compare')
 *   - state-changed (kind: 'shift', from, to) | (kind: 'insert', at, value)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'gap' | 'compare' | 'shift' | 'insert')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type ShellSortData = { type: 'array'; values: number[] };

export async function shellsort(ctx: FacetContext<ShellSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  for (let gap = n >> 1; gap > 0; gap >>= 1) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'gap' }, silent: true });

    for (let i = gap; i < n; i++) {
      if (ctx.cancelled) return;
      const temp = arr[i];
      await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'current' } });
      let j = i;
      while (j >= gap) {
        await ctx.emit({ type: 'phase', payload: { phase: 'compare' }, silent: true });
        await ctx.emit({ type: 'highlight', target: `index:${j - gap}`, payload: { kind: 'compare' } });
        ctx.metric('compare-count', 'inc');
        if (arr[j - gap] > temp) {
          await ctx.emit({ type: 'phase', payload: { phase: 'shift' }, silent: true });
          arr[j] = arr[j - gap];
          await ctx.emit({
            type: 'state-changed',
            target: [`index:${j - gap}`, `index:${j}`],
            payload: { kind: 'shift', from: j - gap, to: j },
          });
          ctx.metric('shift-count', 'inc');
          await ctx.emit({ type: 'unhighlight', target: `index:${j - gap}` });
          j -= gap;
        } else {
          await ctx.emit({ type: 'unhighlight', target: `index:${j - gap}` });
          break;
        }
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
      arr[j] = temp;
      await ctx.emit({
        type: 'state-changed',
        target: `index:${j}`,
        payload: { kind: 'insert', at: j, value: temp },
      });
      await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
    }
  }

  for (let i = 0; i < n; i++) {
    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}
