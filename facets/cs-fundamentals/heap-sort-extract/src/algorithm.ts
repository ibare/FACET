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
 *   쓰지 않는다. 어느 칸에 어느 값이 앉았는지는 장면이 제 줄에서 안다.
 *
 * ── 이벤트 (전부 이 facet 고유)
 *
 *   **payload 가 하나도 없다.** 화면에 뜨는 수 — 꺼낸 값 · 경계 자리 · 옮겨 앉는
 *   차례 — 는 전부 지금 줄에서 나오므로 장면이 스스로 센다. 자리바꿈처럼 구조만
 *   봐서는 안 나오는 것은 아래 `extractTop` 을 내주어 장면이 같은 함수를 부른다.
 *   수를 싣지 않으면 그 수와 화면이 갈릴 자리가 없다.
 *
 *   rewind
 *       줄을 처음 상태로 되돌린다. 경계는 맨 오른쪽, 공중에 뜬 것 없음.
 *       자동 재생을 시작할 때와, 자동 재생이 끝난 뒤 advance 로 되감을 때 발신.
 *
 *   heap-shown      (silent)
 *       되돌린 줄이 최대 힙임을 말하는 첫 캡션. `rewind` 와 **한 걸음**이라
 *       조용히 보내 띠에 0ms 짜리 눈금이 서지 않게 한다 (S-runtime 의 silent 규약).
 *
 *   top-lifted
 *       0번 칸의 값이 줄 위로 떠오른다. 아직 어디에도 앉지 않았다.
 *
 *   boundary-moved
 *       힙이 마지막 칸을 내놓아 경계가 한 칸 왼쪽으로 간다. 떠 있던 값이 바로 그
 *       칸에 앉고, 남은 힙은 모양을 되찾으며 값들이 제 새 칸으로 옮겨 앉는다.
 *       그 자리바꿈은 `extractTop` 이 셈한다.
 *
 *   done
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

/** 꼭대기를 한 번 꺼낸 결과. 걸음이 실어 오지 않고 이 함수가 내준다. */
export type HeapExtractStep = {
  /** 걸음 뒤의 줄 전체. `values[size - 1]` 이 방금 꺼내 앉은 값이다. */
  readonly values: readonly number[];
  /** 새 힙(0..size-2) 의 i 번 칸에 오는 값이 **직전에 있던 칸 번호**. */
  readonly order: readonly number[];
};

/**
 * 꼭대기를 꺼내 마지막 칸에 앉히고 남은 힙의 모양을 되찾는다 — 순수 함수다.
 *
 * 이 값을 payload 로 싣지 않고 함수로 내주는 까닭: 어느 값이 어느 칸에 앉았나는
 * **지금 줄에 순수 함수를 먹이면 나오는 것**이라, 싣는 순간 같은 물음에 답이 둘이
 * 된다 (프로토콜 4절 B 갈래). 장면이 제 줄을 들고 같은 함수를 부른다.
 *
 * @param row  지금 줄 전체. 고치지 않는다.
 * @param size 힙이 차지한 앞쪽 길이. 정렬된 꼬리는 건드리지 않는다.
 */
export function extractTop(row: readonly number[], size: number): HeapExtractStep {
  const a = [...row];
  const pos = a.map((_, i) => i);
  if (size < 2 || size > a.length) {
    return { values: a, order: pos.slice(0, Math.max(0, size - 1)) };
  }
  swap(a, pos, 0, size - 1);
  siftDownFromRoot(a, pos, size - 1);
  return { values: a, order: pos.slice(0, size - 1) };
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
  let row: readonly number[] = Array.isArray(data.values) ? [...data.values] : [];
  const taken: number[] = [];
  const tops: number[] = [];
  for (let n = row.length; n > 1; n--) {
    taken.push(row[0]);
    row = extractTop(row, n).values;
    tops.push(row[0]);
  }
  return { taken, tops, values: [...row] };
}

export const heapSortExtractAlgorithm = async (
  base: FacetContext<HeapSortExtractData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<HeapSortExtractData>;
  const size = Array.isArray(ctx.data.values) ? ctx.data.values.length : 0;
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
    await ctx.emit({ type: 'rewind' });
    // 되돌린 줄이 힙이라는 말은 되돌리기와 한 걸음이다. 조용히 보내 눈금을 하나로 접는다.
    await ctx.emit({ type: 'heap-shown', silent: true });
    if (!(await pause())) return false;

    // 힙이 한 칸만 남을 때까지. 걸음 수는 데이터가 정한다 — 손으로 적은 걸음표가
    // 아니다 (S-piece / C2). 꺼내는 셈 자체는 장면이 `extractTop` 으로 한다.
    for (let n = size; n > 1; n--) {
      await ctx.emit({ type: 'top-lifted' });
      if (!(await pause())) return false;

      await ctx.emit({ type: 'boundary-moved' });
      if (!(await pause())) return false;
    }

    await ctx.emit({ type: 'done' });
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
