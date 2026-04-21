/**
 * 0/1 Knapsack — 분기 한정법 (Branch & Bound).
 *
 *   - 아이템을 value/weight 비율 내림차순으로 정렬
 *   - DFS 분기(include/exclude)
 *   - 분수 배낭 완화로 상계(upper bound) 계산 → best 이하면 가지치기
 *
 * 데이터: { type: 'knapsack', values, weights, capacity }
 * 반환: { value, picks(원본 인덱스) }
 *
 * 이벤트:
 *   - highlight (kind: 'visit')
 *   - state-changed (kind: 'include' | 'exclude', value, weight)
 *   - mark (kind: 'best' | 'final', value, picks)
 *   - phase: visit / bound / prune / include / exclude / update / done
 */

import type { FacetContext } from '@facet/core/runtime';

export type KnapsackData = {
  type: 'knapsack';
  values: number[];
  weights: number[];
  capacity: number;
};

export type KnapsackResult = { value: number; picks: number[] };

export async function knapsack(ctx: FacetContext<KnapsackData>): Promise<KnapsackResult> {
  const n = ctx.data.values.length;
  const cap = ctx.data.capacity;

  // 비율 내림차순으로 정렬 (시각화 인덱스도 정렬된 순서)
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort(
    (a, b) => ctx.data.values[b] / ctx.data.weights[b] - ctx.data.values[a] / ctx.data.weights[a],
  );
  const values = order.map((i) => ctx.data.values[i]);
  const weights = order.map((i) => ctx.data.weights[i]);

  let bestVal = 0;
  let bestPicks: number[] = [];
  const cur: boolean[] = new Array(n).fill(false);

  function upperBound(i: number, value: number, weight: number): number {
    let v = value;
    let w = weight;
    let k = i;
    while (k < n && w + weights[k] <= cap) {
      v += values[k];
      w += weights[k];
      k++;
    }
    if (k < n) v += ((cap - w) * values[k]) / weights[k];
    return v;
  }

  async function dfs(i: number, value: number, weight: number): Promise<void> {
    if (ctx.cancelled) return;
    ctx.metric('visit-count', 'inc');

    await ctx.emit({ type: 'phase', payload: { phase: 'bound' }, silent: true });
    const ub = upperBound(i, value, weight);
    if (ub <= bestVal) {
      await ctx.emit({ type: 'phase', payload: { phase: 'prune' }, silent: true });
      ctx.metric('prune-count', 'inc');
      return;
    }

    if (i === n) {
      if (value > bestVal) {
        await ctx.emit({ type: 'phase', payload: { phase: 'update' }, silent: true });
        bestVal = value;
        bestPicks = cur.flatMap((b, k) => (b ? [order[k]] : []));
        const ids = cur.flatMap((b, k) => (b ? [`index:${k}`] : []));
        await ctx.emit({ type: 'mark', target: ids, payload: { kind: 'best', value, weight } });
      }
      return;
    }

    await ctx.emit({ type: 'phase', payload: { phase: 'visit' }, silent: true });
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'visit' } });

    if (weight + weights[i] <= cap) {
      cur[i] = true;
      await ctx.emit({ type: 'phase', payload: { phase: 'include' }, silent: true });
      await ctx.emit({
        type: 'state-changed',
        target: `index:${i}`,
        payload: { kind: 'include', value: value + values[i], weight: weight + weights[i] },
      });
      await dfs(i + 1, value + values[i], weight + weights[i]);
      if (ctx.cancelled) return;
    }

    cur[i] = false;
    await ctx.emit({ type: 'phase', payload: { phase: 'exclude' }, silent: true });
    await ctx.emit({
      type: 'state-changed',
      target: `index:${i}`,
      payload: { kind: 'exclude', value, weight },
    });
    await dfs(i + 1, value, weight);
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
  }

  await dfs(0, 0, 0);
  if (ctx.cancelled) return { value: 0, picks: [] };
  await ctx.emit({
    type: 'mark',
    target: 'result',
    payload: { kind: 'final', value: bestVal, picks: bestPicks },
  });
  await ctx.emit({ type: 'done' });
  return { value: bestVal, picks: bestPicks };
}
