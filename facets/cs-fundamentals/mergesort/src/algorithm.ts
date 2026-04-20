/**
 * MergeSort 알고리즘 — top-down 재귀 분할 + 병합.
 *
 * 이벤트:
 *   - highlight (kind: 'compare')
 *   - state-changed (kind: 'place', at, value)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'divide' | 'compare' | 'place' | 'merge-end')
 *   - done
 *
 * 메트릭: 'compare-count', 'write-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type MergeSortData = { type: 'array'; values: number[] };

export async function mergesort(ctx: FacetContext<MergeSortData>): Promise<void> {
  const arr = ctx.data.values;
  await msort(arr, 0, arr.length - 1, ctx);
  if (ctx.cancelled) return;
  for (let i = 0; i < arr.length; i++) {
    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });
  }
  await ctx.emit({ type: 'done' });
}

async function msort(arr: number[], lo: number, hi: number, ctx: FacetContext<MergeSortData>): Promise<void> {
  if (ctx.cancelled) return;
  if (lo >= hi) return;
  const mid = (lo + hi) >> 1;
  await ctx.emit({ type: 'phase', payload: { phase: 'divide' } });
  await msort(arr, lo, mid, ctx);
  await msort(arr, mid + 1, hi, ctx);
  await merge(arr, lo, mid, hi, ctx);
}

async function merge(
  arr: number[],
  lo: number,
  mid: number,
  hi: number,
  ctx: FacetContext<MergeSortData>,
): Promise<void> {
  const left = arr.slice(lo, mid + 1);
  const right = arr.slice(mid + 1, hi + 1);
  let i = 0;
  let j = 0;
  let k = lo;

  while (i < left.length && j < right.length) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'compare' } });
    await ctx.emit({
      type: 'highlight',
      target: [`index:${lo + i}`, `index:${mid + 1 + j}`],
      payload: { kind: 'compare' },
    });
    ctx.metric('compare-count', 'inc');

    if (left[i] <= right[j]) {
      arr[k] = left[i];
      await ctx.emit({ type: 'phase', payload: { phase: 'place' } });
      await ctx.emit({
        type: 'state-changed',
        target: `index:${k}`,
        payload: { kind: 'place', at: k, value: left[i] },
      });
      ctx.metric('write-count', 'inc');
      i++;
    } else {
      arr[k] = right[j];
      await ctx.emit({ type: 'phase', payload: { phase: 'place' } });
      await ctx.emit({
        type: 'state-changed',
        target: `index:${k}`,
        payload: { kind: 'place', at: k, value: right[j] },
      });
      ctx.metric('write-count', 'inc');
      j++;
    }
    await ctx.emit({ type: 'unhighlight', target: [`index:${lo + i - 1}`, `index:${mid + 1 + j - 1}`, `index:${k}`] });
    k++;
  }

  while (i < left.length) {
    if (ctx.cancelled) return;
    arr[k] = left[i];
    await ctx.emit({ type: 'phase', payload: { phase: 'place' } });
    await ctx.emit({
      type: 'state-changed',
      target: `index:${k}`,
      payload: { kind: 'place', at: k, value: left[i] },
    });
    ctx.metric('write-count', 'inc');
    i++;
    k++;
  }

  while (j < right.length) {
    if (ctx.cancelled) return;
    arr[k] = right[j];
    await ctx.emit({ type: 'phase', payload: { phase: 'place' } });
    await ctx.emit({
      type: 'state-changed',
      target: `index:${k}`,
      payload: { kind: 'place', at: k, value: right[j] },
    });
    ctx.metric('write-count', 'inc');
    j++;
    k++;
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'merge-end' } });
}
