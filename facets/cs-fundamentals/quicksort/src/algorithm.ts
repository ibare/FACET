/**
 * QuickSort 알고리즘 — 표준 이벤트 어휘로 emit.
 *
 * 식별자 문법:
 *   - 막대 인덱스: `index:<n>`
 *
 * 이벤트:
 *   - highlight (kind: 'pivot' | 'compare' | 'partition-i')
 *   - state-changed (kind: 'swap', i, j)
 *   - mark (kind: 'sorted')
 *   - unhighlight (대상 해제)
 *   - phase (kind: 'pivot-select' | 'compare' | 'swap' | 'partition' | 'recurse')
 *   - done
 *
 * 메트릭: 'compare-count', 'swap-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type QuickSortData = { type: 'array'; values: number[] };

export async function quicksort(ctx: FacetContext<QuickSortData>): Promise<void> {
  const arr = ctx.data.values;
  await partitionRecurse(arr, 0, arr.length - 1, ctx);
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}

async function partitionRecurse(
  arr: number[],
  lo: number,
  hi: number,
  ctx: FacetContext<QuickSortData>,
): Promise<void> {
  if (ctx.cancelled) return;
  if (lo > hi) return;
  if (lo === hi) {
    await ctx.emit({ type: 'mark', target: `index:${lo}`, payload: { kind: 'sorted' } });
    return;
  }

  // 1) pivot 선택 (마지막 원소)
  await ctx.emit({
    type: 'phase',
    payload: { phase: 'pivot-select' },
    silent: true,
  });
  await ctx.emit({
    type: 'highlight',
    target: `index:${hi}`,
    payload: { kind: 'pivot' },
  });

  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    if (ctx.cancelled) return;

    // 2) 비교
    await ctx.emit({ type: 'phase', payload: { phase: 'compare' }, silent: true });
    await ctx.emit({
      type: 'highlight',
      target: `index:${j}`,
      payload: { kind: 'compare' },
    });
    ctx.metric('compare-count', 'inc');

    if (arr[j] < arr[hi]) {
      i++;
      // 3) 교환
      await ctx.emit({ type: 'phase', payload: { phase: 'swap' }, silent: true });
      [arr[i], arr[j]] = [arr[j], arr[i]];
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${i}`, `index:${j}`],
        payload: { kind: 'swap', i, j },
      });
      ctx.metric('swap-count', 'inc');
    }

    // 비교 표시 해제
    await ctx.emit({ type: 'unhighlight', target: `index:${j}` });
  }

  // 4) pivot 을 제 자리로
  await ctx.emit({ type: 'phase', payload: { phase: 'partition' }, silent: true });
  i++;
  [arr[i], arr[hi]] = [arr[hi], arr[i]];
  await ctx.emit({
    type: 'state-changed',
    target: [`index:${i}`, `index:${hi}`],
    payload: { kind: 'swap', i, j: hi },
  });
  ctx.metric('swap-count', 'inc');

  await ctx.emit({ type: 'unhighlight', target: `index:${hi}` });
  await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });

  // 5) 좌우 재귀
  await ctx.emit({ type: 'phase', payload: { phase: 'recurse' }, silent: true });
  await partitionRecurse(arr, lo, i - 1, ctx);
  await partitionRecurse(arr, i + 1, hi, ctx);
}
