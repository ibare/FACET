/**
 * BinarySearch — 정렬된 배열에서 lo/mid/hi로 절반씩 좁혀가며 찾는다.
 *
 * 데이터: { type: 'array', values, target }  (values는 오름차순 정렬 가정)
 * 이벤트:
 *   - highlight (kind: 'lo' | 'mid' | 'hi' | 'range')
 *   - unhighlight
 *   - mark (kind: 'found' | 'not-found' | 'discard')
 *   - phase (kind: 'compare' | 'narrow-left' | 'narrow-right' | 'found' | 'not-found')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type BinarySearchData = { type: 'array'; values: number[]; target: number };

export async function binarysearch(ctx: FacetContext<BinarySearchData>): Promise<number> {
  const arr = ctx.data.values;
  const target = ctx.data.target;
  let lo = 0;
  let hi = arr.length - 1;

  while (lo <= hi) {
    if (ctx.cancelled) return -1;
    const mid = (lo + hi) >> 1;

    await ctx.emit({ type: 'phase', payload: { phase: 'compare' } });
    const rangeIds = [];
    for (let k = lo; k <= hi; k++) rangeIds.push(`index:${k}`);
    await ctx.emit({ type: 'highlight', target: rangeIds, payload: { kind: 'range' } });
    await ctx.emit({ type: 'highlight', target: `index:${mid}`, payload: { kind: 'mid' } });
    ctx.metric('probe-count', 'inc');

    if (arr[mid] === target) {
      await ctx.emit({ type: 'phase', payload: { phase: 'found' } });
      await ctx.emit({ type: 'mark', target: `index:${mid}`, payload: { kind: 'found' } });
      await ctx.emit({ type: 'done' });
      return mid;
    }

    if (arr[mid] < target) {
      await ctx.emit({ type: 'phase', payload: { phase: 'narrow-right' } });
      const drop = [];
      for (let k = lo; k <= mid; k++) drop.push(`index:${k}`);
      await ctx.emit({ type: 'mark', target: drop, payload: { kind: 'discard' } });
      lo = mid + 1;
    } else {
      await ctx.emit({ type: 'phase', payload: { phase: 'narrow-left' } });
      const drop = [];
      for (let k = mid; k <= hi; k++) drop.push(`index:${k}`);
      await ctx.emit({ type: 'mark', target: drop, payload: { kind: 'discard' } });
      hi = mid - 1;
    }
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'not-found' } });
  await ctx.emit({ type: 'mark', target: 'result', payload: { kind: 'not-found' } });
  await ctx.emit({ type: 'done' });
  return -1;
}
