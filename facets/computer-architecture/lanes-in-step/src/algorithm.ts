/**
 * 차선을 나란히 — SIMD 명령 하나는 무엇을 하는가.
 *
 * 같은 c = a + b 를 두 방식이 한 박자씩 함께 셈한다. 명령 하나가 한 박자다.
 * 스칼라는 박자마다 원소 하나를, SIMD 는 박자마다 차선 `width` 개를 한꺼번에 더한다.
 * SIMD 가 끝난 뒤에도 스칼라는 제 박자를 마저 간다.
 *
 * 이벤트 (전부 silent 아님 — 하나하나가 걸음이다)
 *
 *   'init'  payload { a: number[]; b: number[]; width: number }
 *           바탕. 두 줄의 값과 SIMD 폭(차선 수)
 *
 *   'beat'  payload {
 *             beat: number;                                  // 0 부터
 *             scalar: { index: number; sum: number } | null; // 이번 박자에 스칼라가 더한 원소
 *             simd: { start: number; sums: number[] } | null; // 이번 박자에 SIMD 가 더한 차선들
 *           }
 *           명령 하나. 더한 값은 알고리즘이 셈해 싣는다
 *
 *   'done'  payload { scalar: number; simd: number }
 *           두 쪽이 낸 명령 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LanesInStepFacetData = {
  type: 'lanes-in-step';
  a: number[];
  b: number[];
  width: number;
  stepMs: number;
};

export async function lanesInStep(context: FacetContext<LanesInStepFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<LanesInStepFacetData>;
  const { a, b, width, stepMs } = ctx.data;
  const n = Math.min(a.length, b.length);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { a: a.slice(0, n), b: b.slice(0, n), width },
  });

  let scalarCount = 0;
  let simdCount = 0;
  let simdNext = 0;

  // 스칼라가 원소 하나를 더할 때마다 한 박자가 흐른다. 같은 박자에 SIMD 는 차선 width 개를 민다.
  for (let i = 0; i < n; i += 1) {
    if (!(await pause())) return;

    const scalar = { index: i, sum: a[i]! + b[i]! };
    scalarCount += 1;

    let simd: { start: number; sums: number[] } | null = null;
    if (simdNext < n) {
      const start = simdNext;
      const end = Math.min(start + width, n);
      const sums: number[] = [];
      for (let k = start; k < end; k += 1) {
        if (ctx.cancelled) return;
        sums.push(a[k]! + b[k]!);
      }
      simd = { start, sums };
      simdNext = end;
      simdCount += 1;
    }

    await ctx.emit({ type: 'beat', payload: { beat: i, scalar, simd } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { scalar: scalarCount, simd: simdCount } });
}
