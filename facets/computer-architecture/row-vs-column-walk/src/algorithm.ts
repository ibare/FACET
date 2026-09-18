/**
 * 행 우선과 열 우선 — 같은 배열을 두 순서로 돌며 캐시 적중과 실패를 센다.
 *
 * 배열은 메모리에 행 우선으로 놓인다. 원소 (r, c) 의 주소(원소 단위)는 `r * cols + c`,
 * 그 원소가 속한 캐시 줄은 `floor(주소 / lineElems)` 다. 캐시는 `cacheLines` 줄의
 * 완전 연관 · LRU 이고, 두 순회는 각자 빈 캐시에서 시작한다.
 *
 * - 행 순회: r 바깥, c 안쪽
 * - 열 순회: c 바깥, r 안쪽
 *
 * 걸음 하나는 바깥 루프 한 바퀴다 — 안쪽 루프의 읽기 `rows`(또는 `cols`) 번을 한 번에 낸다.
 *
 * 이벤트 (silent 없음)
 * - `sweep` — 바깥 루프 한 바퀴의 읽기들
 *   payload: {
 *     walk: 'row' | 'col';      // 어느 순회인가
 *     outer: number;            // 바깥 루프 변수 (행 순회면 r, 열 순회면 c)
 *     reads: Array<{
 *       r: number; c: number;   // 읽은 원소
 *       line: number;           // 그 원소가 속한 캐시 줄
 *       hit: boolean;           // 캐시에 이미 있었는가
 *       slot: number;           // 그 줄이 캐시의 몇 번째 자리에 있는가 (실패면 새로 들어간 자리)
 *       evicted: number | null; // 실패로 밀려난 줄 (빈 자리에 들어갔으면 null)
 *       acc: number;            // 이 읽기까지 더한 합
 *     }>;
 *   }
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RowVsColumnWalkFacetData = {
  type: 'row-vs-column-walk';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 배열 값. values[r][c] */
  values: number[][];
  /** 캐시 줄 하나에 드는 원소 수 */
  lineElems: number;
  /** 캐시가 담는 줄 수 */
  cacheLines: number;
};

export type Walk = 'row' | 'col';

export type WalkRead = {
  r: number;
  c: number;
  line: number;
  hit: boolean;
  slot: number;
  evicted: number | null;
  acc: number;
};

export type SweepPayload = {
  walk: Walk;
  outer: number;
  reads: WalkRead[];
};

/** 완전 연관 · LRU 캐시. 자리는 고정이고, 실패하면 빈 자리나 가장 오래 안 쓴 자리에 들어간다. */
function makeCache(lines: number) {
  const slots: (number | null)[] = Array.from({ length: lines }, () => null);
  const lastUse: number[] = Array.from({ length: lines }, () => -1);
  let tick = 0;
  return {
    access(line: number): { hit: boolean; slot: number; evicted: number | null } {
      tick += 1;
      const at = slots.indexOf(line);
      if (at >= 0) {
        lastUse[at] = tick;
        return { hit: true, slot: at, evicted: null };
      }
      let victim = slots.indexOf(null);
      if (victim < 0) {
        victim = 0;
        for (let i = 1; i < lines; i += 1) {
          if (lastUse[i]! < lastUse[victim]!) victim = i;
        }
      }
      const evicted = slots[victim] ?? null;
      slots[victim] = line;
      lastUse[victim] = tick;
      return { hit: false, slot: victim, evicted };
    },
  };
}

export async function rowVsColumnWalk(ctx: FacetContext<RowVsColumnWalkFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RowVsColumnWalkFacetData>;
  const { values, lineElems, cacheLines, stepMs } = ctx.data;
  const rows = values.length;
  const cols = values[0]?.length ?? 0;

  // 첫 걸음은 마운트 직후 곧바로 — 문을 한 번 그냥 통과시킨다.
  let opened = false;
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!opened) {
      opened = true;
      return true;
    }
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  async function runWalk(walk: Walk): Promise<boolean> {
    const cache = makeCache(cacheLines);
    const outerN = walk === 'row' ? rows : cols;
    const innerN = walk === 'row' ? cols : rows;
    let acc = 0;
    for (let outer = 0; outer < outerN; outer += 1) {
      if (!(await pause())) return false;
      const reads: WalkRead[] = [];
      for (let inner = 0; inner < innerN; inner += 1) {
        if (ctx.cancelled) return false;
        const r = walk === 'row' ? outer : inner;
        const c = walk === 'row' ? inner : outer;
        const line = Math.floor((r * cols + c) / lineElems);
        const got = cache.access(line);
        acc += values[r]![c]!;
        reads.push({ r, c, line, hit: got.hit, slot: got.slot, evicted: got.evicted, acc });
      }
      await ctx.emit({ type: 'sweep', payload: { walk, outer, reads } satisfies SweepPayload });
    }
    return true;
  }

  if (!(await runWalk('row'))) return;
  await runWalk('col');
}
