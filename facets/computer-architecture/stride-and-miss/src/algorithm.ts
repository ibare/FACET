/**
 * 건너뛰는 간격 — 보폭마다 원소 몇 개를 읽고, 캐시에 올라온 줄 가운데 얼마를 썼는지 센다.
 *
 * 모형: 배열 원소 `count` 칸, 캐시 줄 하나 = 원소 `lineElems` 칸. 보폭 k 의 읽기는
 * 0, k, 2k, … 로 `reads` 번. 보폭마다 빈 캐시에서 시작하고 캐시는 넉넉하다(밀어내기
 * 없음). 읽는 칸의 줄이 캐시에 없으면 그 줄이 통째로 올라온다.
 *
 * 이벤트 (전부 silent 아님):
 *   read   { strideIndex: number; stride: number; readIndex: number;
 *            index: number; line: number; miss: boolean }
 *          — 원소 index 를 읽는다. line 은 그 원소의 줄 번호, miss 는 그 줄이 이번
 *            보폭에서 처음 올라오는지. readIndex 0 이 그 보폭의 시작이다
 *   settle { strideIndex: number }
 *          — 그 보폭의 읽기가 끝났다. 올라온 줄 가운데 안 쓴 칸이 버려진다
 *
 * ctx.metric 은 부르지 않는다 (조각).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StrideAndMissFacetData = {
  type: 'stride-and-miss';
  /** 배열 원소 수 */
  count: number;
  /** 캐시 줄 하나에 드는 원소 수 */
  lineElems: number;
  /** 원소 하나의 바이트 수 */
  elemBytes: number;
  /** 견줄 보폭들 */
  strides: number[];
  /** 보폭마다 읽는 원소 수 */
  reads: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export async function strideAndMiss(ctx0: FacetContext<StrideAndMissFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<StrideAndMissFacetData>;
  const { count, lineElems, strides, reads, stepMs } = ctx.data;

  let first = true;
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    // 첫 걸음 앞에는 빈 화면을 두지 않는다
    if (first) {
      first = false;
      return true;
    }
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let si = 0; si < strides.length; si += 1) {
    if (ctx.cancelled) return;
    const stride = strides[si]!;
    const loaded = new Set<number>();
    for (let r = 0; r < reads; r += 1) {
      if (!(await pause())) return;
      const index = r * stride;
      if (index >= count) break;
      const line = Math.floor(index / lineElems);
      const miss = !loaded.has(line);
      loaded.add(line);
      await ctx.emit({
        type: 'read',
        payload: { strideIndex: si, stride, readIndex: r, index, line, miss },
      });
    }
    if (!(await pause())) return;
    await ctx.emit({ type: 'settle', payload: { strideIndex: si } });
  }
}
