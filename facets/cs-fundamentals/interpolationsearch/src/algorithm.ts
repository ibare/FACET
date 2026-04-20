/**
 * InterpolationSearch — 균등 분포된 정렬 배열에서 위치를 보간으로 추정.
 *
 * pos = lo + ((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo])
 *
 * 데이터: { type: 'array', values, target } (values는 오름차순 정렬)
 */

import type { FacetContext } from '@facet/core/runtime';

export type InterpolationSearchData = { type: 'array'; values: number[]; target: number };

export async function interpolationsearch(
  ctx: FacetContext<InterpolationSearchData>,
): Promise<number> {
  const arr = ctx.data.values;
  const target = ctx.data.target;
  let lo = 0;
  let hi = arr.length - 1;

  while (lo <= hi && target >= arr[lo] && target <= arr[hi]) {
    if (ctx.cancelled) return -1;
    let pos: number;
    if (arr[hi] === arr[lo]) {
      pos = lo;
    } else {
      pos = lo + Math.floor(((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo]));
    }
    if (pos < lo || pos > hi) break;

    await ctx.emit({ type: 'phase', payload: { phase: 'estimate' } });
    const rangeIds: string[] = [];
    for (let k = lo; k <= hi; k++) rangeIds.push(`index:${k}`);
    await ctx.emit({ type: 'highlight', target: rangeIds, payload: { kind: 'range' } });
    await ctx.emit({ type: 'highlight', target: `index:${pos}`, payload: { kind: 'pos' } });
    ctx.metric('probe-count', 'inc');

    if (arr[pos] === target) {
      await ctx.emit({ type: 'phase', payload: { phase: 'found' } });
      await ctx.emit({ type: 'mark', target: `index:${pos}`, payload: { kind: 'found' } });
      await ctx.emit({ type: 'done' });
      return pos;
    }

    if (arr[pos] < target) {
      await ctx.emit({ type: 'phase', payload: { phase: 'narrow-right' } });
      const drop: string[] = [];
      for (let k = lo; k <= pos; k++) drop.push(`index:${k}`);
      await ctx.emit({ type: 'mark', target: drop, payload: { kind: 'discard' } });
      lo = pos + 1;
    } else {
      await ctx.emit({ type: 'phase', payload: { phase: 'narrow-left' } });
      const drop: string[] = [];
      for (let k = pos; k <= hi; k++) drop.push(`index:${k}`);
      await ctx.emit({ type: 'mark', target: drop, payload: { kind: 'discard' } });
      hi = pos - 1;
    }
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'not-found' } });
  await ctx.emit({ type: 'mark', target: 'result', payload: { kind: 'not-found' } });
  await ctx.emit({ type: 'done' });
  return -1;
}
