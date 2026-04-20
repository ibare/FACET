/**
 * RadixSort 알고리즘 — LSD 라딕스 정렬 (10진).
 *
 * 자릿수마다 안정적 카운팅 분배. 비음의 정수만.
 *
 * 이벤트:
 *   - highlight (kind: 'scan')
 *   - state-changed (kind: 'place', at, value)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'find-max' | 'digit-pass' | 'count' | 'place')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type RadixSortData = { type: 'array'; values: number[] };

export async function radixsort(ctx: FacetContext<RadixSortData>): Promise<void> {
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

  let exp = 1;
  while (Math.floor(max / exp) > 0) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'digit-pass' } });
    await countingByDigit(arr, exp, ctx);
    exp *= 10;
  }

  for (let i = 0; i < n; i++) {
    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}

async function countingByDigit(
  arr: number[],
  exp: number,
  ctx: FacetContext<RadixSortData>,
): Promise<void> {
  const n = arr.length;
  const output = new Array<number>(n).fill(0);
  const count = new Array<number>(10).fill(0);

  await ctx.emit({ type: 'phase', payload: { phase: 'count' } });
  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'scan' } });
    count[Math.floor(arr[i] / exp) % 10]++;
    ctx.metric('read-count', 'inc');
    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }
  for (let d = 1; d < 10; d++) count[d] += count[d - 1];

  for (let i = n - 1; i >= 0; i--) {
    if (ctx.cancelled) return;
    const d = Math.floor(arr[i] / exp) % 10;
    output[count[d] - 1] = arr[i];
    count[d]--;
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'place' } });
  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return;
    arr[i] = output[i];
    await ctx.emit({
      type: 'state-changed',
      target: `index:${i}`,
      payload: { kind: 'place', at: i, value: output[i] },
    });
    ctx.metric('write-count', 'inc');
  }
}
