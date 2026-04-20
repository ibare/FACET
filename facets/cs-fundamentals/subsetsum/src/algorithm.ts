/**
 * Subset Sum — 백트래킹.
 *
 *   dfs(i, sum):
 *     if sum == target: return chosen
 *     if i == n or sum > target: backtrack
 *     dfs(i+1, sum + arr[i])  # include
 *     dfs(i+1, sum)           # exclude
 *
 * 데이터: { type: 'subsetsum', values, target }
 * 반환: 첫 발견된 부분집합 인덱스 배열, 없으면 null
 *
 * 이벤트:
 *   - highlight (kind: 'visit')
 *   - state-changed (kind: 'include' | 'exclude', sum)
 *   - mark (kind: 'found' | 'prune')
 *   - phase: visit / include / exclude / prune / hit / done
 */

import type { FacetContext } from '@facet/core/runtime';

export type SubsetSumData = { type: 'subsetsum'; values: number[]; target: number };

export async function subsetsum(ctx: FacetContext<SubsetSumData>): Promise<number[] | null> {
  const arr = ctx.data.values;
  const target = ctx.data.target;
  const n = arr.length;
  const chosen: boolean[] = new Array(n).fill(false);
  let found: number[] | null = null;

  async function dfs(i: number, sum: number): Promise<boolean> {
    if (ctx.cancelled) return false;
    ctx.metric('visit-count', 'inc');

    if (sum === target) {
      await ctx.emit({ type: 'phase', payload: { phase: 'hit' } });
      const ids = chosen.flatMap((b, k) => (b ? [`index:${k}`] : []));
      await ctx.emit({ type: 'mark', target: ids, payload: { kind: 'found', sum } });
      found = chosen.flatMap((b, k) => (b ? [k] : []));
      return true;
    }
    if (i === n || sum > target) {
      if (sum > target) {
        await ctx.emit({ type: 'phase', payload: { phase: 'prune' } });
        ctx.metric('prune-count', 'inc');
      }
      return false;
    }

    await ctx.emit({ type: 'phase', payload: { phase: 'visit' } });
    await ctx.emit({ type: 'highlight', target: `index:${i}`, payload: { kind: 'visit' } });

    // include arr[i]
    chosen[i] = true;
    await ctx.emit({ type: 'phase', payload: { phase: 'include' } });
    await ctx.emit({
      type: 'state-changed',
      target: `index:${i}`,
      payload: { kind: 'include', sum: sum + arr[i] },
    });
    if (await dfs(i + 1, sum + arr[i])) return true;
    if (ctx.cancelled) return false;

    // exclude arr[i]
    chosen[i] = false;
    await ctx.emit({ type: 'phase', payload: { phase: 'exclude' } });
    await ctx.emit({
      type: 'state-changed',
      target: `index:${i}`,
      payload: { kind: 'exclude', sum },
    });
    if (await dfs(i + 1, sum)) return true;
    if (ctx.cancelled) return false;

    await ctx.emit({ type: 'unhighlight', target: `index:${i}` });
    return false;
  }

  await dfs(0, 0);
  if (ctx.cancelled) return null;
  if (!found) {
    await ctx.emit({ type: 'mark', target: 'result', payload: { kind: 'not-found' } });
  }
  await ctx.emit({ type: 'done' });
  return found;
}
