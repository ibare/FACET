/**
 * 퀵 정렬 (Lomuto 방식) — 기준 하나를 정해 좌우로 가르고, 갈라진 양쪽을 같은
 * 방법으로 다시 가른다.
 *
 * 두 축을 말한다.
 *   1. **한 번 가르면 기준의 최종 자리가 확정된다** — 그 칸은 다시 움직이지 않는다.
 *   2. **가르는 일은 제자리에서 맞바꿈만으로 된다** — 여벌 배열이 없다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase           payload { phase }                                   silent: true
 *   - range-enter     payload { lo, hi, side: 'root'|'left'|'right', size }
 *   - range-done      payload { lo, hi, kind: 'empty'|'single', index?, value? }
 *   - partition-begin target `index:<hi>` payload { lo, hi, pivotIndex, pivotValue, boundary }
 *   - highlight       target `index:<j>`  payload { kind: 'comparing', index, value, pivotValue }
 *   - state-changed   target [`index:<i>`, `index:<j>`] payload { kind: 'swap', i, j }
 *   - side-decided    target `index:<n>`  payload { index, j, value, side: 'small'|'big', moved, boundary }
 *   - unhighlight     target `index:<j>`
 *   - mark            target `index:<p>`  payload { kind: 'sorted' }
 *   - partition-end   target `index:<p>`  payload { lo, hi, pivotIndex, pivotValue }
 *   - done            payload { partitions }
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'range-check' | 'partition-call' | 'pick-pivot' | 'compare' |
 *   'send-left' | 'place-pivot' | 'recurse-left' | 'recurse-right'
 *
 * 메트릭 (C5): 'compare-count' · 'swap-count' · 'partition-count'
 *
 * 맞바꿈 수를 셀 때 `i === j` 인 제자리 맞바꿈은 세지 않는다. 코드에는 그 줄이
 * 그대로 있지만 (Lomuto 는 자기 자신과 맞바꾼다) 실제로 옮겨진 값이 없기
 * 때문이다. 화면의 수는 실제로 일어난 이동만 센다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type QuickSortData = { type: 'array'; values: number[] };

/** 어느 쪽으로 내려온 재귀인지. `range-enter` payload 의 `side`. */
type RangeSide = 'root' | 'left' | 'right';

export async function quickSort(ctx: FacetContext<QuickSortData>): Promise<void> {
  const arr = ctx.data.values;
  let partitions = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /** Lomuto 가르기 — 맨 뒤를 기준 삼고 경계 인덱스 하나를 끌고 간다. */
  async function partition(lo: number, hi: number): Promise<number> {
    await phase('pick-pivot');
    const pivot = arr[hi];
    let i = lo - 1;
    partitions++;
    ctx.metric('partition-count', 'inc');
    await ctx.emit({
      type: 'partition-begin',
      target: `index:${hi}`,
      payload: { lo, hi, pivotIndex: hi, pivotValue: pivot, boundary: i },
    });

    for (let j = lo; j < hi; j++) {
      if (ctx.cancelled) return lo;

      await phase('compare');
      await ctx.emit({
        type: 'highlight',
        target: `index:${j}`,
        payload: { kind: 'comparing', index: j, value: arr[j], pivotValue: pivot },
      });
      ctx.metric('compare-count', 'inc');

      if (arr[j] <= pivot) {
        await phase('send-left');
        i++;
        const moved = i !== j;
        if (moved) {
          const tmp = arr[i];
          arr[i] = arr[j];
          arr[j] = tmp;
          ctx.metric('swap-count', 'inc');
          await ctx.emit({
            type: 'state-changed',
            target: [`index:${i}`, `index:${j}`],
            payload: { kind: 'swap', i, j },
          });
        }
        await ctx.emit({
          type: 'side-decided',
          target: `index:${i}`,
          payload: { index: i, j, value: arr[i], side: 'small', moved, boundary: i },
        });
      } else {
        await ctx.emit({
          type: 'side-decided',
          target: `index:${j}`,
          payload: { index: j, j, value: arr[j], side: 'big', moved: false, boundary: i },
        });
      }

      await ctx.emit({ type: 'unhighlight', target: `index:${j}` });
    }

    if (ctx.cancelled) return lo;

    await phase('place-pivot');
    const p = i + 1;
    if (p !== hi) {
      const tmp = arr[p];
      arr[p] = arr[hi];
      arr[hi] = tmp;
      ctx.metric('swap-count', 'inc');
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${p}`, `index:${hi}`],
        payload: { kind: 'swap', i: p, j: hi },
      });
    }
    await ctx.emit({ type: 'mark', target: `index:${p}`, payload: { kind: 'sorted' } });
    await ctx.emit({
      type: 'partition-end',
      target: `index:${p}`,
      payload: { lo, hi, pivotIndex: p, pivotValue: pivot },
    });
    return p;
  }

  async function sortRange(lo: number, hi: number, side: RangeSide): Promise<void> {
    if (ctx.cancelled) return;

    await ctx.emit({
      type: 'range-enter',
      payload: { lo, hi, side, size: hi - lo + 1 },
    });
    await phase('range-check');

    if (lo >= hi) {
      if (lo === hi) {
        await ctx.emit({ type: 'mark', target: `index:${lo}`, payload: { kind: 'sorted' } });
        await ctx.emit({
          type: 'range-done',
          payload: { lo, hi, kind: 'single', index: lo, value: arr[lo] },
        });
      } else {
        await ctx.emit({ type: 'range-done', payload: { lo, hi, kind: 'empty' } });
      }
      return;
    }

    await phase('partition-call');
    const p = await partition(lo, hi);
    if (ctx.cancelled) return;

    await phase('recurse-left');
    await sortRange(lo, p - 1, 'left');
    if (ctx.cancelled) return;

    await phase('recurse-right');
    await sortRange(p + 1, hi, 'right');
  }

  if (arr.length === 0) {
    if (!ctx.cancelled) await ctx.emit({ type: 'done', payload: { partitions } });
    return;
  }

  await sortRange(0, arr.length - 1, 'root');

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { partitions } });
}
