/**
 * CountingSort 알고리즘 — 비비교 정렬. 값의 빈도를 세고 다시 쓴다.
 *
 * 가정: 입력은 0 이상의 작은 정수.
 *
 * 이벤트:
 *   - highlight (kind: 'scan')
 *   - state-changed (kind: 'place', at, value)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'find-max' | 'count' | 'reconstruct')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type CountingSortData = { type: 'array'; values: number[] };

export async function countingsort(ctx: FacetContext<CountingSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;
  if (n === 0) {
    await ctx.emit({ type: 'done' });
    return;
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'find-max' } });
  let max = arr[0];
  for (let i = 1; i < n; i++) {
    if (ctx.cancelled) return;
    if (arr[i] > max) max = arr[i];
  }

  const count = new Array<number>(max + 1).fill(0);

  await ctx.emit({ type: 'phase', payload: { phase: 'count' } });
  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'scan' } });
    count[arr[i]]++;
    ctx.metric('read-count', 'inc');
    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'reconstruct' } });
  let k = 0;
  for (let value = 0; value <= max; value++) {
    while (count[value] > 0) {
      if (ctx.cancelled) return;
      arr[k] = value;
      await ctx.emit({
        type: 'state-changed',
        target: `index:${k}`,
        payload: { kind: 'place', at: k, value },
      });
      ctx.metric('write-count', 'inc');
      await ctx.emit({ type: 'mark', target: `index:${k}`, payload: { kind: 'sorted' } });
      k++;
      count[value]--;
    }
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}
