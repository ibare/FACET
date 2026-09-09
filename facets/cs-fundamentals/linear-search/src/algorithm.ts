/**
 * 선형 탐색 — 앞에서부터 한 칸씩 보며 찾는 값이 나오는지 견준다.
 *
 * 두 축을 말한다.
 *   1. **줄이 서 있지 않으면 중간에 포기할 근거가 없다** — 없다고 답하려면
 *      끝까지 다 봐야 한다.
 *   2. **찾으면 그 자리에서 멈춘다** — 뒤는 볼 필요가 없다.
 *
 * 그래서 같은 배열에서도 훑는 길이가 갈린다. 55 는 다섯 칸에서 끝나고,
 * 50 은 여덟 칸을 다 보고 나서야 없다고 답한다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase           payload { phase }                                      silent: true
 *   - search-begin    payload { round, total, target }
 *   - highlight       target `index:<i>` payload { index, value, target }
 *   - compare-result  target `index:<i>` payload { index, value, target, equal }
 *   - state-changed   target `index:<i>` payload { kind: 'seen' }
 *   - mark            target `index:<i>` payload { kind: 'found' }
 *   - search-end      payload { round, target, found, index, examined }
 *   - done            payload { searches, compares, hits }
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'advance' | 'compare' | 'found' | 'not-found'
 *
 * 메트릭 (C5): 'search-count' · 'compare-count' · 'hit-count'
 *
 * 견줌은 실제로 값을 맞대 본 횟수만 센다. 자리를 옮기는 것 자체는 세지 않는다 —
 * 코드에서 값이 드는 비용은 `arr[i] == target` 한 줄에 있다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type LinearSearchData = {
  type: 'array';
  values: number[];
  /** 차례로 찾아 볼 값들. 첫째는 있는 값, 둘째는 없는 값. */
  targets: number[];
};

export async function linearSearch(ctx: FacetContext<LinearSearchData>): Promise<void> {
  const arr = ctx.data.values;
  const targets = ctx.data.targets;

  let compares = 0;
  let hits = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /** 한 번의 훑기. 찾은 자리를 돌려준다 (없으면 -1). */
  async function scan(round: number, target: number): Promise<number> {
    await ctx.emit({
      type: 'search-begin',
      payload: { round, total: targets.length, target },
    });
    ctx.metric('search-count', 'inc');

    let examined = 0;

    for (let i = 0; i < arr.length; i++) {
      if (ctx.cancelled) return -1;

      await phase('advance');
      await ctx.emit({
        type: 'highlight',
        target: `index:${i}`,
        payload: { index: i, value: arr[i], target },
      });

      await phase('compare');
      examined++;
      compares++;
      ctx.metric('compare-count', 'inc');
      const equal = arr[i] === target;
      await ctx.emit({
        type: 'compare-result',
        target: `index:${i}`,
        payload: { index: i, value: arr[i], target, equal },
      });

      if (equal) {
        await phase('found');
        hits++;
        ctx.metric('hit-count', 'inc');
        await ctx.emit({ type: 'mark', target: `index:${i}`, payload: { kind: 'found' } });
        await ctx.emit({
          type: 'search-end',
          payload: { round, target, found: true, index: i, examined },
        });
        return i;
      }

      await ctx.emit({
        type: 'state-changed',
        target: `index:${i}`,
        payload: { kind: 'seen' },
      });
    }

    if (ctx.cancelled) return -1;

    await phase('not-found');
    await ctx.emit({
      type: 'search-end',
      payload: { round, target, found: false, index: -1, examined },
    });
    return -1;
  }

  for (let round = 0; round < targets.length; round++) {
    if (ctx.cancelled) return;
    await scan(round, targets[round]);
  }

  if (ctx.cancelled) return;
  await ctx.emit({
    type: 'done',
    payload: { searches: targets.length, compares, hits },
  });
}
