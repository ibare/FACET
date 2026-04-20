/**
 * Factorial — 재귀로 콜 스택을 시각화.
 *
 * 데이터: { type: 'integer', n: number }
 * 시각화: bar-chart에 콜 스택 프레임을 push/pop, text-display에 누적 결과
 *
 * 이벤트:
 *   - state-changed (kind: 'push' | 'pop', stack: number[])
 *   - highlight (kind: 'top') — 현재 평가 중인 프레임
 *   - mark (kind: 'result', value)
 *   - phase (kind: 'call' | 'base' | 'return')
 *   - done
 */

import type { FacetContext } from '@facet/core/runtime';

export type FactorialData = { type: 'integer'; n: number };

export async function factorial(ctx: FacetContext<FactorialData>): Promise<number> {
  const n = ctx.data.n;
  const stack: number[] = [];

  async function rec(k: number): Promise<number> {
    if (ctx.cancelled) return 0;
    stack.push(k);
    await ctx.emit({
      type: 'state-changed',
      target: 'stack',
      payload: { kind: 'push', stack: [...stack] },
    });
    await ctx.emit({
      type: 'highlight',
      target: `index:${stack.length - 1}`,
      payload: { kind: 'top' },
    });
    ctx.metric('call-count', 'inc');

    if (k <= 1) {
      await ctx.emit({ type: 'phase', payload: { phase: 'base' } });
      await ctx.emit({ type: 'mark', target: 'partial', payload: { kind: 'partial', value: 1 } });
      stack.pop();
      await ctx.emit({
        type: 'state-changed',
        target: 'stack',
        payload: { kind: 'pop', stack: [...stack] },
      });
      return 1;
    }

    await ctx.emit({ type: 'phase', payload: { phase: 'call' } });
    const sub = await rec(k - 1);

    if (ctx.cancelled) return 0;
    await ctx.emit({ type: 'phase', payload: { phase: 'return' } });
    const result = k * sub;
    await ctx.emit({
      type: 'mark',
      target: 'partial',
      payload: { kind: 'partial', value: result },
    });
    stack.pop();
    await ctx.emit({
      type: 'state-changed',
      target: 'stack',
      payload: { kind: 'pop', stack: [...stack] },
    });
    return result;
  }

  const result = await rec(n);
  if (ctx.cancelled) return 0;
  await ctx.emit({ type: 'mark', target: 'result', payload: { kind: 'result', value: result } });
  await ctx.emit({ type: 'done' });
  return result;
}
