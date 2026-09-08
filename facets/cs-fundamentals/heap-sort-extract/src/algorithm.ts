/**
 * heap-sort-extract 조각 알고리즘 — 꼭대기를 꺼내 뒤에 쌓기를 되풀이한다.
 *
 * 이 조각이 답하는 질문:
 *   "정렬된 결과를 담을 자리를 따로 빌려야 하는가?"
 *
 * 화면의 동사는 **경계가 밀려간다** 이다. 한 줄이 둘로 갈려 있고, 꺼낼 때마다
 * 경계가 한 칸씩 왼쪽으로 간다. 왼쪽(힙)은 줄고 오른쪽(끝난 것)은 자란다.
 * 꺼낸 값은 사라지지 않고 경계 바로 오른쪽 — 힙이 방금 내놓은 칸 — 에 앉는다.
 * 그래서 꺼냄과 쌓임이 한 동작이고, 새 자리를 하나도 얻지 않는다.
 *
 * ── 식별자
 *   쓰지 않는다. 자리는 payload 의 숫자 인덱스로만 가리킨다 (칸이 다섯뿐이고
 *   이벤트마다 자리 여럿을 한 번에 옮기므로 target 문법이 담을 모양이 아니다).
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음 — 모두 시각 변화가 있는 걸음이다)
 *
 *   rewind          { values: number[] }
 *       줄을 처음 상태로 되돌린다. 경계는 맨 오른쪽, 공중에 뜬 것 없음.
 *       자동 재생을 시작할 때와, 자동 재생이 끝난 뒤 advance 로 되감을 때 발신.
 *
 *   heap-shown      (payload 없음)
 *       되돌린 줄이 최대 힙임을 말하는 첫 캡션. rewind 와 한 걸음을 이룬다.
 *
 *   top-lifted      { value: number }
 *       0번 칸의 값이 줄 위로 떠오른다. 아직 어디에도 앉지 않았다.
 *
 *   boundary-moved  { boundary: number; value: number; order: number[] }
 *       힙이 마지막 칸을 내놓아 경계가 한 칸 왼쪽으로 간다. 힙은 이제
 *       0..boundary-1 이고, 떠 있던 value 가 boundary 번 칸에 앉는다.
 *       order[i] 는 새 힙의 i 번 칸에 오는 값이 **직전에 있던 칸 번호**다.
 *       힙 모양을 되찾는 과정 자체는 이 조각의 관심이 아니라 자리바꿈의
 *       결과만 넘긴다 — 화면은 값들이 제 새 칸으로 옮겨 앉는 것만 보인다.
 *
 *   done            { values: number[] }
 *       한 칸만 남으면 그것이 이미 제자리다. 경계가 맨 왼쪽까지 가고 줄 전체가
 *       오름차순으로 끝난다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type HeapSortExtractData = {
  type: string;
  /** 이미 최대 힙인 배열. 층 순서로 늘어놓은 한 줄. */
  values: number[];
  /** 걸음 사이의 쉼 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 750;

/** 값과 "직전 칸 번호" 를 함께 바꾼다 — order 를 만들기 위한 짝 이동. */
function swap(a: number[], pos: number[], i: number, j: number): void {
  const v = a[i];
  a[i] = a[j];
  a[j] = v;
  const p = pos[i];
  pos[i] = pos[j];
  pos[j] = p;
}

/** 뿌리에서 아래로 내려보내 힙 모양을 되찾는다. 화면에 걸음으로 나오지 않는다. */
function siftDownFromRoot(a: number[], pos: number[], size: number): void {
  let i = 0;
  for (;;) {
    const left = 2 * i + 1;
    const right = left + 1;
    let big = i;
    if (left < size && a[left] > a[big]) big = left;
    if (right < size && a[right] > a[big]) big = right;
    if (big === i) return;
    swap(a, pos, i, big);
    i = big;
  }
}

/**
 * 꺼낸 순서와 끝난 줄을 셈해 둔다. 화면에 쓰는 값은 지어내지 않고 이 함수가
 * 데이터에서 셈한 것을 쓴다 (테스트가 대조에 쓴다).
 */
export function computeHeapSortExtractResult(data: HeapSortExtractData): {
  taken: number[];
  tops: number[];
  values: number[];
} {
  const a = Array.isArray(data.values) ? [...data.values] : [];
  const taken: number[] = [];
  const tops: number[] = [];
  for (let n = a.length; n > 1; n--) {
    const pos = a.map((_, i) => i);
    taken.push(a[0]);
    swap(a, pos, 0, n - 1);
    siftDownFromRoot(a, pos, n - 1);
    tops.push(a[0]);
  }
  return { taken, tops, values: a };
}

export const heapSortExtractAlgorithm = async (
  base: FacetContext<HeapSortExtractData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<HeapSortExtractData>;
  const source = Array.isArray(ctx.data.values) ? [...ctx.data.values] : [];
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생을 마치면 수동으로 넘어간다. 그 뒤로는 advance 가 걸음을 민다. */
  let manual = false;

  /**
   * 걸음 사이의 쉼.
   *
   * 문을 emit **뒤**에 둔다. 그래야 되감고 나서 첫 걸음이 곧바로 보이고,
   * 자동 재생이 끝난 뒤 처음 누르는 advance 가 아무 일도 안 하는 것으로
   * 읽히지 않는다 (S-piece).
   */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    try {
      await ctx.waitForInput();
    } catch {
      return false;
    }
    return !ctx.cancelled;
  };

  const playThrough = async (): Promise<boolean> => {
    const a = [...source];

    await ctx.emit({ type: 'rewind', payload: { values: [...a] } });
    await ctx.emit({ type: 'heap-shown' });
    if (!(await pause())) return false;

    // 힙이 한 칸만 남을 때까지. 걸음 수는 데이터가 정한다 — 손으로 적은 걸음표가
    // 아니다 (S-piece / C2).
    for (let n = a.length; n > 1; n--) {
      const pos = a.map((_, i) => i);
      const taken = a[0];

      await ctx.emit({ type: 'top-lifted', payload: { value: taken } });
      if (!(await pause())) return false;

      // 힙이 마지막 칸을 내놓는다. 꺼낸 값이 바로 그 칸에 들어가고, 남은 힙은
      // 모양을 되찾는다.
      swap(a, pos, 0, n - 1);
      siftDownFromRoot(a, pos, n - 1);

      await ctx.emit({
        type: 'boundary-moved',
        payload: { boundary: n - 1, value: taken, order: pos.slice(0, n - 1) },
      });
      if (!(await pause())) return false;
    }

    await ctx.emit({ type: 'done', payload: { values: [...a] } });
    return true;
  };

  await playThrough();

  // 자동 재생이 끝났다. advance 를 받으면 되감고 한 걸음씩 짚는다.
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch {
      return;
    }
    if (input.type !== 'advance') continue;
    manual = true;
    if (!(await playThrough())) return;
  }
};
