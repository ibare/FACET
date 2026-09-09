/**
 * 선택 정렬 — 한 바퀴를 다 훑어 가장 작은 것을 찾고, 그것을 앞으로 데려온다.
 *
 * 두 축을 말한다.
 *   1. **견줌은 많고 이동은 적다** — 훑는 동안에는 아무것도 안 움직이고, 다 훑은
 *      뒤에 딱 한 번 옮긴다. 이동 횟수가 자리 수를 넘지 않는다.
 *   2. **견줌 수는 입력에 상관없이 늘 같다** — 바퀴마다 하나씩 줄어드는
 *      6+5+4+3+2+1 이 전부다. 이미 정렬된 배열을 줘도 21 번을 그대로 견준다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                    silent: true
 *   - pass-begin     target `index:<i>` payload { pass, seat, minIndex, minValue, remaining }
 *   - highlight      target `index:<j>` payload { kind: 'comparing', index, value, minIndex, minValue }
 *   - min-moved      target `index:<j>` payload { index, value, previousIndex, previousValue }
 *   - scan-end       target `index:<m>` payload { pass, seat, compares, minIndex, minValue }
 *   - state-changed  target [`index:<i>`, `index:<m>`] payload { kind: 'swap', i, j, seatValue, sentBack }
 *   - mark           target `index:<i>` payload { kind: 'sorted' }
 *   - pass-end       payload { pass, seat, compares, swapped, totalCompares, totalSwaps }
 *   - done           payload { passes, compares, swaps }
 *
 * `unhighlight` 를 쓰지 않는다. 훑는 자리는 한 번에 하나뿐이라 다음 `highlight`
 * 가 오면 앞의 것이 저절로 물러난다 — 그것을 stage 의 `setCursor` 가 맡는다.
 * 걸음 수를 절반으로 줄이려는 것이기도 하다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'pick-seat' | 'compare' | 'move-min' | 'settle' | 'swap'
 *
 * 메트릭 (C5): 'compare-count' · 'swap-count' · 'pass-count'
 *
 * 맞바꿈은 `min_idx !== i` 일 때만 센다. 표식이 이미 제자리면 맞바꾸는 시늉조차
 * 하지 않으므로 [64, 25, 12, 22, 11, 90, 34] 은 여섯 바퀴에 맞바꿈이 다섯이다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type SelectionSortData = { type: 'array'; values: number[] };

/** 정렬 결과만 순수하게 셈한다 (테스트 대조용). */
export function computeSelectionSortResult(values: number[]): {
  values: number[];
  compares: number;
  swaps: number;
  passes: number;
} {
  const arr = [...values];
  const n = arr.length;
  let compares = 0;
  let swaps = 0;
  let passes = 0;
  for (let i = 0; i < n - 1; i++) {
    passes++;
    let minIdx = i;
    for (let j = i + 1; j < n; j++) {
      compares++;
      if (arr[j] < arr[minIdx]) minIdx = j;
    }
    if (minIdx !== i) {
      const tmp = arr[i];
      arr[i] = arr[minIdx];
      arr[minIdx] = tmp;
      swaps++;
    }
  }
  return { values: arr, compares, swaps, passes };
}

export async function selectionSort(ctx: FacetContext<SelectionSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;
  let compares = 0;
  let swaps = 0;
  let passes = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  for (let i = 0; i < n - 1; i++) {
    if (ctx.cancelled) return;

    await phase('pick-seat');
    let minIdx = i;
    let passCompares = 0;
    passes++;
    ctx.metric('pass-count', 'inc');
    await ctx.emit({
      type: 'pass-begin',
      target: `index:${i}`,
      payload: {
        pass: passes,
        seat: i,
        minIndex: minIdx,
        minValue: arr[minIdx],
        remaining: n - 1 - i,
      },
    });

    for (let j = i + 1; j < n; j++) {
      if (ctx.cancelled) return;

      await phase('compare');
      compares++;
      passCompares++;
      ctx.metric('compare-count', 'inc');
      await ctx.emit({
        type: 'highlight',
        target: `index:${j}`,
        payload: {
          kind: 'comparing',
          index: j,
          value: arr[j],
          minIndex: minIdx,
          minValue: arr[minIdx],
        },
      });

      if (arr[j] < arr[minIdx]) {
        await phase('move-min');
        const previousIndex = minIdx;
        const previousValue = arr[minIdx];
        minIdx = j;
        await ctx.emit({
          type: 'min-moved',
          target: `index:${j}`,
          payload: { index: j, value: arr[j], previousIndex, previousValue },
        });
      }
    }

    if (ctx.cancelled) return;

    await phase('settle');
    await ctx.emit({
      type: 'scan-end',
      target: `index:${minIdx}`,
      payload: {
        pass: passes,
        seat: i,
        compares: passCompares,
        minIndex: minIdx,
        minValue: arr[minIdx],
      },
    });

    const swapped = minIdx !== i;
    if (swapped) {
      await phase('swap');
      const seatValue = arr[minIdx];
      const sentBack = arr[i];
      arr[i] = seatValue;
      arr[minIdx] = sentBack;
      swaps++;
      ctx.metric('swap-count', 'inc');
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${i}`, `index:${minIdx}`],
        payload: { kind: 'swap', i, j: minIdx, seatValue, sentBack },
      });
    }

    await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'sorted' } });
    await ctx.emit({
      type: 'pass-end',
      payload: {
        pass: passes,
        seat: i,
        compares: passCompares,
        swapped,
        totalCompares: compares,
        totalSwaps: swaps,
      },
    });
  }

  if (ctx.cancelled) return;

  // 앞의 n-1 자리가 확정되면 마지막 하나는 저절로 제자리다. 바깥 for 가
  // `n - 1` 에서 멈추는 이유이고, 코드 패널의 그 줄이 말하는 것이기도 하다.
  if (n > 0) {
    await ctx.emit({ type: 'mark', target: `index:${n - 1}`, payload: { kind: 'sorted' } });
  }
  await ctx.emit({ type: 'done', payload: { passes, compares, swaps } });
}
