/**
 * BubbleSort 알고리즘 — 인접 비교/교환의 파도가 한 패스마다 가장 큰 값을 뒤로 떠올린다.
 *
 * 식별자: `index:<n>`
 * 이벤트:
 *   - phase (kind: 'compare' | 'swap' | 'pass-end')
 *   - pass-begin   payload: { passNumber, passLength }
 *   - highlight    payload: { kind: 'comparing', passNumber, positionInPass, passLength }
 *   - state-changed payload: { kind: 'swap', i, j }
 *   - rising-move  payload: { fromIndex, passNumber, swapped }
 *   - unhighlight
 *   - settle       payload: { passNumber }
 *   - mark         payload: { kind: 'sorted' }
 *   - pass-end     payload: { passNumber, swapCount, sortedTailSize }
 *   - done
 *
 * 메트릭: 'compare-count', 'swap-count', 'pass-count'
 */

import type { FacetContext } from '@facet/core/runtime';

export type BubbleSortData = { type: 'array'; values: number[] };

export async function bubblesort(ctx: FacetContext<BubbleSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;

  for (let pass = 0; pass < n - 1; pass++) {
    if (ctx.cancelled) return;
    const lastUnsorted = n - 1 - pass;
    const passLength = lastUnsorted; // 이 패스의 비교 횟수
    const passNumber = pass + 1;     // 1-based

    let swappedThisPass = false;
    let swapCount = 0;

    await ctx.emit({
      type: 'pass-begin',
      payload: { passNumber, passLength },
    });

    for (let j = 0; j < lastUnsorted; j++) {
      if (ctx.cancelled) return;

      // 1) 비교
      await ctx.emit({ type: 'phase', payload: { phase: 'compare' }, silent: true });
      await ctx.emit({
        type: 'highlight',
        target: [`index:${j}`, `index:${j + 1}`],
        payload: {
          kind: 'comparing',
          passNumber,
          positionInPass: j,
          passLength,
        },
      });
      ctx.metric('compare-count', 'inc');

      let swapped = false;
      if (arr[j] > arr[j + 1]) {
        // 2) 교환
        await ctx.emit({ type: 'phase', payload: { phase: 'swap' }, silent: true });
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        await ctx.emit({
          type: 'state-changed',
          target: [`index:${j}`, `index:${j + 1}`],
          payload: { kind: 'swap', i: j, j: j + 1 },
        });
        ctx.metric('swap-count', 'inc');
        swappedThisPass = true;
        swapCount++;
        swapped = true;
      }

      // 큰 값(이번 비교의 승자)의 위치는 항상 j+1. swap 여부는 payload 로 전달.
      await ctx.emit({
        type: 'rising-move',
        target: `index:${j + 1}`,
        payload: { fromIndex: j, passNumber, swapped },
      });

      await ctx.emit({ type: 'unhighlight', target: [`index:${j}`, `index:${j + 1}`] });
    }

    // 패스 끝 — lastUnsorted 인덱스가 정렬 확정
    await ctx.emit({ type: 'phase', payload: { phase: 'pass-end' }, silent: true });
    await ctx.emit({
      type: 'settle',
      target: `index:${lastUnsorted}`,
      payload: { passNumber },
      silent: true,
    });
    await ctx.emit({
      type: 'mark',
      target: `index:${lastUnsorted}`,
      payload: { kind: 'sorted' },
    });
    await ctx.emit({
      type: 'pass-end',
      payload: { passNumber, swapCount, sortedTailSize: passNumber },
    });
    ctx.metric('pass-count', 'inc');

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

/**
 * 알고리즘 실행과 별개로 "정렬된 최종 상태" 를 즉시 계산.
 * goal-preview(computeFrom: 'sorted') 에서 사용.
 */
export function computeBubblesortResult(initialData: BubbleSortData): BubbleSortData {
  const arr = [...initialData.values];
  arr.sort((a, b) => a - b);
  return { type: 'array', values: arr };
}
