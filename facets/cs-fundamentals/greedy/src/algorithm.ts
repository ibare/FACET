/**
 * 그리디 — 활동 선택 (activity selection).
 *
 * 회의실 하나에 회의를 최대한 많이 넣는다. **끝나는 시간이 이른 것부터** 훑으며
 * 앞 회의가 끝난 뒤에 시작하는 것만 고른다. 뒤를 내다보지 않고 매번 눈앞의
 * 하나를 고르는데도 그것이 최적이다.
 *
 * 끌고 다니는 상태는 `lastEnd` 하나뿐이다. 그것이 이 알고리즘의 전부다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 끝나는 시간 순으로 줄 세운 뒤의 자리 번호다.
 *
 * 이벤트 (C2):
 *   - phase        payload { phase }                                        silent: true
 *   - sort-done    payload { order: number[], changed: boolean }
 *   - state-changed payload { kind: 'boundary', lastEnd, picks }
 *   - highlight    target `index:<i>` payload { kind: 'visiting', index, start, end }
 *   - compare      target `index:<i>` payload { index, start, lastEnd, accepted }
 *   - mark         target `index:<i>`
 *                  payload { kind: 'picked',  index, start, end, lastEnd, picks }
 *                  payload { kind: 'skipped', index, start, end, lastEnd, blockedBy }
 *   - unhighlight  target `index:<i>`
 *   - done         payload { chosen: number[], compares, picks, skips }
 *
 * `sort-done` 의 `order` 는 정렬 전 자리 번호를 정렬 후 순서로 늘어놓은 것이다.
 * 이 facet 의 자료는 이미 끝나는 시간 순이라 항등 순열이 나오고 `changed` 가
 * false 다 — 그래도 알고리즘이 실제로 줄을 세우고 그 결과를 말한다. 화면의 수는
 * 전부 여기서 셈한 것이다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'sort' | 'init' | 'visit' | 'compare' | 'pick' | 'skip' | 'done'
 *
 * 메트릭 (C5): 'compare-count' · 'pick-count' · 'skip-count'
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type GreedyData = {
  type: 'activities';
  /** 회의별 시작 시각. `ends` 와 같은 길이이며 자리 번호로 짝지어진다. */
  starts: number[];
  /** 회의별 끝나는 시각. */
  ends: number[];
};

export async function greedy(ctx: FacetContext<GreedyData>): Promise<void> {
  const starts = ctx.data.starts;
  const ends = ctx.data.ends;
  const n = Math.min(starts.length, ends.length);

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  if (n === 0) {
    if (!ctx.cancelled) {
      await ctx.emit({ type: 'done', payload: { chosen: [], compares: 0, picks: 0, skips: 0 } });
    }
    return;
  }

  // ── 정렬. 끝나는 시간 오름차순, 같으면 원래 자리 순 (안정).
  await phase('sort');
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => ends[a] - ends[b] || a - b,
  );
  const sortedStarts = order.map((k) => starts[k]);
  const sortedEnds = order.map((k) => ends[k]);
  for (let i = 0; i < n; i++) {
    starts[i] = sortedStarts[i];
    ends[i] = sortedEnds[i];
  }
  const changed = order.some((k, i) => k !== i);
  await ctx.emit({ type: 'sort-done', payload: { order: [...order], changed } });
  if (ctx.cancelled) return;

  // ── 끌고 다니는 상태 하나. 아직 아무 회의도 없으므로 -1.
  await phase('init');
  let lastEnd = -1;
  let compares = 0;
  let picks = 0;
  let skips = 0;
  const chosen: number[] = [];
  await ctx.emit({ type: 'state-changed', payload: { kind: 'boundary', lastEnd, picks } });

  for (let i = 0; i < n; i++) {
    if (ctx.cancelled) return;

    await phase('visit');
    await ctx.emit({
      type: 'highlight',
      target: `index:${i}`,
      payload: { kind: 'visiting', index: i, start: starts[i], end: ends[i] },
    });

    await phase('compare');
    const accepted = starts[i] >= lastEnd;
    compares++;
    ctx.metric('compare-count', 'inc');
    await ctx.emit({
      type: 'compare',
      target: `index:${i}`,
      payload: { index: i, start: starts[i], lastEnd, accepted },
    });

    if (accepted) {
      await phase('pick');
      lastEnd = ends[i];
      picks++;
      chosen.push(i);
      ctx.metric('pick-count', 'inc');
      await ctx.emit({
        type: 'mark',
        target: `index:${i}`,
        payload: { kind: 'picked', index: i, start: starts[i], end: ends[i], lastEnd, picks },
      });
    } else {
      await phase('skip');
      skips++;
      ctx.metric('skip-count', 'inc');
      await ctx.emit({
        type: 'mark',
        target: `index:${i}`,
        payload: {
          kind: 'skipped',
          index: i,
          start: starts[i],
          end: ends[i],
          lastEnd,
          blockedBy: chosen.length > 0 ? chosen[chosen.length - 1] : -1,
        },
      });
    }

    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }

  if (ctx.cancelled) return;
  await phase('done');
  await ctx.emit({
    type: 'done',
    payload: { chosen: [...chosen], compares, picks, skips },
  });
}
