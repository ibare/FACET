/**
 * HeapSort 알고리즘 — 배열 기반 max-heap.
 *
 * 단계:
 *   1) build-max-heap: 마지막 비-leaf 부터 sift-down
 *   2) 반복: 루트(최댓값) 와 끝 swap → heap 크기 1 감소 → sift-down
 *
 * 이벤트:
 *   - highlight (kind: 'compare' | 'root')
 *   - state-changed (kind: 'swap', i, j)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'build-heap' | 'sift-down' | 'extract' | 'compare-children')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type HeapSortData = { type: 'array'; values: number[] };

export async function heapsort(ctx: FacetContext<HeapSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  await ctx.emit({ type: 'phase', payload: { phase: 'build-heap' } });
  for (let i = (n >> 1) - 1; i >= 0; i--) {
    if (ctx.cancelled) return;
    await siftDown(arr, i, n, ctx);
  }

  for (let end = n - 1; end > 0; end--) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'extract' } });
    [arr[0], arr[end]] = [arr[end], arr[0]];
    await ctx.emit({
      type: 'state-changed',
      target: [`index:0`, `index:${end}`],
      payload: { kind: 'swap', i: 0, j: end },
    });
    ctx.metric('swap-count', 'inc');
    await ctx.emit({ type: 'mark', target: `index:${end}`, payload: { kind: 'sorted' } });
    await siftDown(arr, 0, end, ctx);
  }

  if (n > 0) {
    await ctx.emit({ type: 'mark', target: `index:0`, payload: { kind: 'sorted' } });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}

async function siftDown(
  arr: number[],
  start: number,
  end: number,
  ctx: FacetContext<HeapSortData>,
): Promise<void> {
  let root = start;
  await ctx.emit({ type: 'phase', payload: { phase: 'sift-down' } });
  await ctx.emit({ type: 'highlight', target: `index:${root}`, payload: { kind: 'root' } });

  while (true) {
    if (ctx.cancelled) return;
    const left = 2 * root + 1;
    const right = 2 * root + 2;
    if (left >= end) break;

    let larger = left;
    if (right < end) {
      await ctx.emit({ type: 'phase', payload: { phase: 'compare-children' } });
      await ctx.emit({
        type: 'highlight',
        target: [`index:${left}`, `index:${right}`],
        payload: { kind: 'compare' },
      });
      ctx.metric('compare-count', 'inc');
      if (arr[right] > arr[left]) larger = right;
      await ctx.emit({ type: 'unhighlight', target: [`index:${left}`, `index:${right}`] });
    }

    ctx.metric('compare-count', 'inc');
    if (arr[root] >= arr[larger]) break;

    [arr[root], arr[larger]] = [arr[larger], arr[root]];
    await ctx.emit({
      type: 'state-changed',
      target: [`index:${root}`, `index:${larger}`],
      payload: { kind: 'swap', i: root, j: larger },
    });
    ctx.metric('swap-count', 'inc');

    await ctx.emit({ type: 'unhighlight', target: `index:${root}` });
    root = larger;
    await ctx.emit({ type: 'highlight', target: `index:${root}`, payload: { kind: 'root' } });
  }
  await ctx.emit({ type: 'unhighlight', target: `index:${root}` });
}
