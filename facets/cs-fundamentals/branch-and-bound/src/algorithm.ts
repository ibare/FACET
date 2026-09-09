/**
 * 분기 한정 (branch and bound) — 0/1 배낭을 표를 채우지 않고 푼다.
 *
 * 물건마다 "담는다 / 두고 간다" 로 갈래를 뻗되, 갈래에 들어설 때마다 **거기서
 * 최선을 다했을 때의 값(한계)** 을 재고, 그것이 지금까지의 최고를 못 넘으면
 * 그 아래를 통째로 접는다. 같은 답에 훨씬 적은 걸음으로 닿는다.
 *
 * 한계를 재는 방법이 이 알고리즘의 절반이다 — 남은 물건을 값/무게가 큰 순서로
 * 담되 마지막 하나는 **쪼개서라도** 한도를 채운다. 쪼갤 수 있다고 봤으니 실제
 * 답보다 절대 낮지 않고, 그래서 이 값으로 자르는 것이 안전하다. 쪼개는 자리는
 * 반드시 실수 나눗셈이다 (`irs.ts` 의 `bound-split`).
 *
 * 식별자 (C1): `node:<id>` 만 쓴다. `<id>` 는 `n0` · `n1` … 로 **방문 순서** 이며,
 * 그 번호가 그대로 stage 의 가로 자리(칸) 가 된다. 세로 자리는 payload 의 `depth`.
 *
 * 이벤트 (C2) — 전부 이 facet 고유 확장이다:
 *   - phase           payload { phase }                                      silent: true
 *   - branch-enter    target `node:<id>` payload { id, parentId, depth, taken, w, v, best }
 *   - weight-overflow target `node:<id>` payload { id, w, capacity }
 *   - best-updated    target `node:<id>` payload { id, best, prevBest }
 *   - items-exhausted target `node:<id>` payload { id, v }
 *   - bound-begin     target `node:<id>` payload { id, from, room, total }
 *   - bound-add       target `node:<id>` payload { id, k, value, weight, total, room }
 *   - bound-fraction  target `node:<id>` payload { id, k, value, weight, room, part, total }
 *   - bound-end       target `node:<id>` payload { id, bound }
 *   - branch-cut      target `node:<id>` payload { id, bound, best }
 *   - branch-keep     target `node:<id>` payload { id, bound, best }
 *   - branch-return   target `node:<id>` payload { id, best }
 *   - done            payload { best, visits, cuts, overflows, subsets }
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'enter' | 'overflow' | 'new-best' | 'all-used' | 'measure-bound' | 'cut' |
 *   'branch-take' | 'branch-skip' | 'return-best' |
 *   'bound-init' | 'bound-fit' | 'bound-split' | 'bound-return'
 *
 * 메트릭 (C5): 'visit-count' · 'cut-count' · 'overflow-count'
 *
 * 자르는 조건은 `bound <= best` 다. 같으면 자른다 — 더 나을 수 없기 때문이다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type BranchAndBoundData = {
  type: 'knapsack';
  /** 값. 값/무게 비가 큰 순서로 미리 정렬된 상태로 다룬다. */
  values: number[];
  /** 무게. `values` 와 같은 순서. */
  weights: number[];
  /** 배낭 한도. */
  capacity: number;
  /** 정렬 전 원래 물건 번호. 화면에서 물건을 부를 때 쓴다. */
  labels: number[];
};

export async function branchAndBound(ctx: FacetContext<BranchAndBoundData>): Promise<void> {
  const { values, weights, capacity } = ctx.data;
  const n = values.length;

  let visits = 0;
  let cuts = 0;
  let overflows = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /**
   * 한계. 남은 물건을 순서대로 담되 마지막 하나는 쪼개 담는다.
   * `irs.ts` 의 `bound` 함수와 같은 걸음을 밟는다.
   */
  async function measureBound(id: string, i: number, w: number, v: number): Promise<number> {
    await phase('bound-init');
    let total = v;
    let room = capacity - w;
    let k = i;
    await ctx.emit({
      type: 'bound-begin',
      target: `node:${id}`,
      payload: { id, from: i, room, total },
    });

    while (k < n) {
      if (ctx.cancelled) return total;
      if (weights[k] <= room) {
        await phase('bound-fit');
        total = total + values[k];
        room = room - weights[k];
        await ctx.emit({
          type: 'bound-add',
          target: `node:${id}`,
          payload: { id, k, value: values[k], weight: weights[k], total, room },
        });
        k = k + 1;
      } else {
        await phase('bound-split');
        const part = (values[k] * room) / weights[k];
        total = total + part;
        await ctx.emit({
          type: 'bound-fraction',
          target: `node:${id}`,
          payload: { id, k, value: values[k], weight: weights[k], room, part, total },
        });
        break;
      }
    }

    await phase('bound-return');
    await ctx.emit({ type: 'bound-end', target: `node:${id}`, payload: { id, bound: total } });
    return total;
  }

  /**
   * 한 갈래. `irs.ts` 의 `knapsack` 과 같은 걸음이며, `best` 를 받아 갱신된
   * 값을 돌려주는 꼴도 같다 (전역 상태 없음).
   */
  async function explore(
    id: string,
    parentId: string | null,
    taken: boolean | null,
    i: number,
    w: number,
    v: number,
    bestIn: number,
  ): Promise<number> {
    let bestHere = bestIn;

    visits++;
    ctx.metric('visit-count', 'inc');
    await phase('enter');
    await ctx.emit({
      type: 'branch-enter',
      target: `node:${id}`,
      payload: { id, parentId, depth: i, taken, w, v, best: bestHere },
    });

    if (w > capacity) {
      await phase('overflow');
      overflows++;
      ctx.metric('overflow-count', 'inc');
      await ctx.emit({
        type: 'weight-overflow',
        target: `node:${id}`,
        payload: { id, w, capacity },
      });
      return bestHere;
    }

    if (v > bestHere) {
      await phase('new-best');
      const prevBest = bestHere;
      bestHere = v;
      await ctx.emit({
        type: 'best-updated',
        target: `node:${id}`,
        payload: { id, best: bestHere, prevBest },
      });
    }

    if (i >= n) {
      await phase('all-used');
      await ctx.emit({ type: 'items-exhausted', target: `node:${id}`, payload: { id, v } });
      return bestHere;
    }

    await phase('measure-bound');
    const bound = await measureBound(id, i, w, v);
    if (ctx.cancelled) return bestHere;

    if (bound <= bestHere) {
      await phase('cut');
      cuts++;
      ctx.metric('cut-count', 'inc');
      await ctx.emit({
        type: 'branch-cut',
        target: `node:${id}`,
        payload: { id, bound, best: bestHere },
      });
      return bestHere;
    }
    await ctx.emit({
      type: 'branch-keep',
      target: `node:${id}`,
      payload: { id, bound, best: bestHere },
    });

    await phase('branch-take');
    bestHere = await explore(
      `n${visits}`,
      id,
      true,
      i + 1,
      w + weights[i],
      v + values[i],
      bestHere,
    );
    if (ctx.cancelled) return bestHere;

    await phase('branch-skip');
    bestHere = await explore(`n${visits}`, id, false, i + 1, w, v, bestHere);
    if (ctx.cancelled) return bestHere;

    await phase('return-best');
    await ctx.emit({
      type: 'branch-return',
      target: `node:${id}`,
      payload: { id, best: bestHere },
    });
    return bestHere;
  }

  const best = await explore('n0', null, null, 0, 0, 0, 0);
  if (ctx.cancelled) return;

  await ctx.emit({
    type: 'done',
    payload: { best, visits, cuts, overflows, subsets: 2 ** n },
  });
}
