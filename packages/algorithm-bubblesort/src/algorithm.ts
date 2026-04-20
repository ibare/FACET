/**
 * BubbleSort 알고리즘 — 단순 이중 루프, 인접 비교/교환.
 *
 * 식별자: `index:<n>`
 * 이벤트:
 *   - highlight (kind: 'compare')
 *   - state-changed (kind: 'swap', i, j)
 *   - mark (kind: 'sorted')
 *   - unhighlight
 *   - phase (kind: 'compare' | 'swap' | 'pass-end')
 *   - done
 *
 * 메트릭: 'compare-count', 'swap-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type BubbleSortData = { type: 'array'; values: number[] };

export async function bubblesort(ctx: FacetContext<BubbleSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  for (let pass = 0; pass < n - 1; pass++) {
    if (ctx.cancelled) return;
    let swappedThisPass = false;
    const lastUnsorted = n - 1 - pass;

    for (let j = 0; j < lastUnsorted; j++) {
      if (ctx.cancelled) return;

      // 1) 비교
      await ctx.emit({ type: 'phase', payload: { phase: 'compare' } });
      await ctx.emit({
        type: 'highlight',
        target: [`index:${j}`, `index:${j + 1}`],
        payload: { kind: 'compare' },
      });
      ctx.metric('compare-count', 'inc');

      if (arr[j] > arr[j + 1]) {
        // 2) 교환
        await ctx.emit({ type: 'phase', payload: { phase: 'swap' } });
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        await ctx.emit({
          type: 'state-changed',
          target: [`index:${j}`, `index:${j + 1}`],
          payload: { kind: 'swap', i: j, j: j + 1 },
        });
        ctx.metric('swap-count', 'inc');
        swappedThisPass = true;
      }

      await ctx.emit({ type: 'unhighlight', target: [`index:${j}`, `index:${j + 1}`] });
    }

    // 한 패스 끝 — lastUnsorted 인덱스가 정렬됨
    await ctx.emit({ type: 'phase', payload: { phase: 'pass-end' } });
    await ctx.emit({
      type: 'mark',
      target: `index:${lastUnsorted}`,
      payload: { kind: 'sorted' },
    });

    // early-exit: 한 번도 교환이 없었다면 이미 정렬 완료
    if (!swappedThisPass) {
      for (let k = 0; k < lastUnsorted; k++) {
        await ctx.emit({ type: 'mark', target: `index:${k}`, payload: { kind: 'sorted' } });
      }
      break;
    }
  }

  // 마지막 남은 0번 요소 sorted 표시
  if (!ctx.cancelled && n > 0) {
    await ctx.emit({ type: 'mark', target: 'index:0', payload: { kind: 'sorted' } });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}
