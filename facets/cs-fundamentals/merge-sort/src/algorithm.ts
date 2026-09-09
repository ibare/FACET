/**
 * merge-sort 알고리즘 — 쪼개어 내려가고, 낱개에서 되짚어 오르며 합친다.
 *
 * 식별자 (C1): `index:<i>` 하나만 쓴다. 재귀의 마디도 결국 배열의 한 구간이라
 * 자리 번호로 족하다.
 *
 * 이벤트 (C2):
 *   - phase        silent. payload: { phase }
 *   - split        payload: { lo, hi, mid, depth }
 *   - descend      payload: { lo, hi, depth, side: 'L' | 'R' }
 *   - base         payload: { lo, hi, depth }
 *   - merge-begin  payload: { lo, mid, hi, depth }
 *   - copy-out     payload: { lo, mid, hi, depth, left: number[], right: number[] }
 *   - highlight    target: [`index:<l>`, `index:<r>`]  payload: { kind: 'front' }
 *   - take         target: `index:<to>`
 *                  payload: { side: 'left' | 'right', from, to, value, drain }
 *   - merge-end    payload: { lo, hi, depth, values: number[] }
 *   - done
 *
 * phase 어휘 (C3 — `irs.ts` 의 phase 필드와 글자 단위로 같다):
 *   'base' | 'split' | 'go-left' | 'go-right' | 'merge' |
 *   'copy' | 'compare' | 'take-left' | 'take-right' |
 *   'drain-left' | 'drain-right'
 *
 * 메트릭 (C5): 'compare-count' · 'move-count' · 'recurse-depth'
 *
 * 화면 문안은 하나도 싣지 않는다 (C10) — 무엇이라 말할지는 projector 가
 * `FacetJson.messages` 의 키로 정한다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type MergeSortData = { type: 'array'; values: number[] };

export async function mergeSort(ctx: FacetContext<MergeSortData>): Promise<void> {
  const arr = ctx.data.values;

  /** 지금까지 닿은 가장 깊은 자리. metric 은 누적 합이라 늘어난 만큼만 얹는다. */
  let deepest = 0;

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  async function merge(lo: number, mid: number, hi: number, depth: number): Promise<void> {
    await phase('copy');
    const left = arr.slice(lo, mid + 1);
    const right = arr.slice(mid + 1, hi + 1);
    await ctx.emit({
      type: 'copy-out',
      payload: { lo, mid, hi, depth, left: [...left], right: [...right] },
    });

    let i = 0;
    let j = 0;
    let k = lo;

    while (i < left.length && j < right.length) {
      if (ctx.cancelled) return;
      const l = left[i] as number;
      const r = right[j] as number;

      await phase('compare');
      await ctx.emit({
        type: 'highlight',
        target: [`index:${lo + i}`, `index:${mid + 1 + j}`],
        payload: { kind: 'front' },
      });
      ctx.metric('compare-count', 'inc');

      if (l <= r) {
        await phase('take-left');
        arr[k] = l;
        await ctx.emit({
          type: 'take',
          target: `index:${k}`,
          payload: { side: 'left', from: lo + i, to: k, value: l, drain: false },
        });
        i++;
      } else {
        await phase('take-right');
        arr[k] = r;
        await ctx.emit({
          type: 'take',
          target: `index:${k}`,
          payload: { side: 'right', from: mid + 1 + j, to: k, value: r, drain: false },
        });
        j++;
      }
      ctx.metric('move-count', 'inc');
      k++;
    }

    while (i < left.length) {
      if (ctx.cancelled) return;
      const value = left[i] as number;
      await phase('drain-left');
      arr[k] = value;
      await ctx.emit({
        type: 'take',
        target: `index:${k}`,
        payload: { side: 'left', from: lo + i, to: k, value, drain: true },
      });
      ctx.metric('move-count', 'inc');
      i++;
      k++;
    }

    while (j < right.length) {
      if (ctx.cancelled) return;
      const value = right[j] as number;
      await phase('drain-right');
      arr[k] = value;
      await ctx.emit({
        type: 'take',
        target: `index:${k}`,
        payload: { side: 'right', from: mid + 1 + j, to: k, value, drain: true },
      });
      ctx.metric('move-count', 'inc');
      j++;
      k++;
    }

    await ctx.emit({
      type: 'merge-end',
      payload: { lo, hi, depth, values: arr.slice(lo, hi + 1) },
    });
  }

  async function sort(lo: number, hi: number, depth: number): Promise<void> {
    if (ctx.cancelled) return;
    if (depth > deepest) {
      ctx.metric('recurse-depth', depth - deepest);
      deepest = depth;
    }

    if (lo >= hi) {
      await phase('base');
      await ctx.emit({ type: 'base', payload: { lo, hi, depth } });
      return;
    }

    await phase('split');
    const mid = Math.floor((lo + hi) / 2);
    await ctx.emit({ type: 'split', payload: { lo, hi, mid, depth } });

    await phase('go-left');
    await ctx.emit({ type: 'descend', payload: { lo, hi: mid, depth: depth + 1, side: 'L' } });
    await sort(lo, mid, depth + 1);
    if (ctx.cancelled) return;

    await phase('go-right');
    await ctx.emit({
      type: 'descend',
      payload: { lo: mid + 1, hi, depth: depth + 1, side: 'R' },
    });
    await sort(mid + 1, hi, depth + 1);
    if (ctx.cancelled) return;

    await phase('merge');
    await ctx.emit({ type: 'merge-begin', payload: { lo, mid, hi, depth } });
    await merge(lo, mid, hi, depth);
  }

  if (arr.length > 0) await sort(0, arr.length - 1, 0);

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}
