/**
 * 이진 탐색 (반복형) — 줄 선 값들의 가운데를 보고, 남은 구간의 절반을 버린다.
 *
 * 두 축을 말한다.
 *   1. **한 번 견줄 때마다 후보가 절반이 된다** — 12 → 6 → 3 → 1.
 *   2. **「없다」고 답하려면 구간이 비어야 한다** — `lo` 가 `hi` 를 지나쳐야
 *      비로소 못 찾았다고 말할 수 있다. 그래서 있는 값 하나와 없는 값 하나를
 *      잇달아 찾는다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                        silent: true
 *   - search-begin   payload { run, target, lo, hi, size }
 *   - highlight      target `index:<mid>` payload { kind: 'probing', index, value, target, lo, hi, size }
 *   - compare-result target `index:<mid>` payload { index, value, target, cmp: 'lt'|'gt'|'eq', lo, hi, size }
 *   - half-dropped   payload { run, side: 'left'|'right', lo, hi, size }
 *   - range-empty    payload { run, target, lo, hi }
 *   - mark           target `index:<mid>` payload { kind: 'found' }
 *   - search-end     payload { run, target, found, index, compares }
 *   - done           payload { searches, hits, compares }
 *
 * `unhighlight` 를 쓰지 않는다. 가운데 칸의 표시는 구간이 좁혀지는 순간
 * (`half-dropped`) 또는 탐색이 끝나는 순간 (`search-end`) 에 함께 거둬지므로,
 * 그것만을 위한 걸음을 하나 더 두면 재생이 늘어질 뿐이다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'range-check' | 'pick-mid' | 'compare' | 'found' |
 *   'drop-left' | 'drop-right' | 'not-found'
 *
 * 메트릭 (C5): 'compare-count' · 'search-count' · 'hit-count'
 *
 * 「왼쪽 버림」은 `arr[mid] < target` 일 때다 — 가운데를 **포함해** 왼쪽을
 * 통째로 버리고 `lo = mid + 1` 로 간다. 「오른쪽 버림」은 그 거울상이다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type BinarySearchData = {
  type: 'array';
  /** 오름차순으로 줄 선 값들. 이진 탐색의 전제라 섞으면 안 된다. */
  values: number[];
  /** 차례로 찾아 볼 값들. */
  targets: number[];
};

export async function binarySearch(ctx: FacetContext<BinarySearchData>): Promise<void> {
  const arr = ctx.data.values;
  const targets = Array.isArray(ctx.data.targets) ? ctx.data.targets : [];

  let searches = 0;
  let hits = 0;
  let compares = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  for (let run = 0; run < targets.length; run++) {
    if (ctx.cancelled) return;

    const target = targets[run];
    let lo = 0;
    let hi = arr.length - 1;
    let runCompares = 0;

    searches++;
    ctx.metric('search-count', 'inc');
    await ctx.emit({
      type: 'search-begin',
      payload: { run: run + 1, target, lo, hi, size: hi - lo + 1 },
    });

    for (;;) {
      if (ctx.cancelled) return;

      await phase('range-check');

      if (lo > hi) {
        await ctx.emit({ type: 'range-empty', payload: { run: run + 1, target, lo, hi } });
        await phase('not-found');
        await ctx.emit({
          type: 'search-end',
          payload: { run: run + 1, target, found: false, index: -1, compares: runCompares },
        });
        break;
      }

      await phase('pick-mid');
      const mid = Math.floor((lo + hi) / 2);
      await ctx.emit({
        type: 'highlight',
        target: `index:${mid}`,
        payload: {
          kind: 'probing',
          index: mid,
          value: arr[mid],
          target,
          lo,
          hi,
          size: hi - lo + 1,
        },
      });

      await phase('compare');
      compares++;
      runCompares++;
      ctx.metric('compare-count', 'inc');

      const cmp = arr[mid] === target ? 'eq' : arr[mid] < target ? 'lt' : 'gt';
      await ctx.emit({
        type: 'compare-result',
        target: `index:${mid}`,
        payload: { index: mid, value: arr[mid], target, cmp, lo, hi, size: hi - lo + 1 },
      });

      if (cmp === 'eq') {
        await phase('found');
        hits++;
        ctx.metric('hit-count', 'inc');
        await ctx.emit({ type: 'mark', target: `index:${mid}`, payload: { kind: 'found' } });
        await ctx.emit({
          type: 'search-end',
          payload: { run: run + 1, target, found: true, index: mid, compares: runCompares },
        });
        break;
      }

      if (cmp === 'lt') {
        await phase('drop-left');
        lo = mid + 1;
        await ctx.emit({
          type: 'half-dropped',
          payload: { run: run + 1, side: 'left', lo, hi, size: hi - lo + 1 },
        });
      } else {
        await phase('drop-right');
        hi = mid - 1;
        await ctx.emit({
          type: 'half-dropped',
          payload: { run: run + 1, side: 'right', lo, hi, size: hi - lo + 1 },
        });
      }
    }
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { searches, hits, compares } });
}
