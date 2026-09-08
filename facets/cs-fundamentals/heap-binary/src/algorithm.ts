/**
 * heap-binary — 이진 힙(최소 힙) 완결형 algorithm.
 *
 * 조각 넷(`heapProperty` · `siftUp` · `siftDown` · `arrayAsTree`)이 부품을 다
 * 갖췄다. 이 완결형이 하는 일은 그 부품들이 **한 물건이 되는 자리**를 주는
 * 것이다 — 학습자가 자기 값을 넣고 빼며 구조가 어떻게 변하는지 몰아 보고,
 * 조각에는 없는 두 연산을 만난다.
 *
 *   heapify   아무렇게나 놓인 배열을 **한 번에** 힙으로 만든다. 하나씩 넣는
 *             것보다 싸다는 것이 요점이고, 그 차이는 견줌 수를 세어야 보인다.
 *   sort      꼭대기를 계속 빼내면 정렬이 나온다. 힙이 정렬 알고리즘이기도
 *             하다는 사실은 한 번에 여러 연산을 몰아 봐야 드러난다.
 *
 * ── 진행 모델
 *
 * `mechanismKind: 'reactive'`. mount 즉시 초기 배열을 힙으로 만드는 시연을
 * 한 번 보이고, 그 뒤로는 `waitForInput` 루프에서 학습자의 조작을 받는다.
 *
 * ── 식별자 (C1)
 *
 *   `index:<i>`   배열의 i 번 칸. 나무의 자리와 같은 것을 가리킨다 —
 *                 자리 i 의 자식은 2i+1 · 2i+2, 부모는 ⌊(i−1)/2⌋ 다.
 *
 * ── 이벤트
 *
 * | type            | 표준 | target      | payload |
 * | --------------- | --- | ----------- | ------- |
 * | `append`        | O   | `index:<i>` | `{ value, index, size }` 새 값이 끝자리에 앉는다 |
 * | `compare`       | O   | `index:<a>` | `{ a, b, aValue, bValue, aheadIsA }` 두 자리를 견준다 |
 * | `swap`          | O   | `index:<a>` | `{ a, b }` 두 자리가 값을 맞바꾼다 |
 * | `mark`          | O   | `index:<i>` | `{ index }` 그 자리에 자리 잡았다 |
 * | `state-changed` | O   | 없음         | `{ values }` 배열 전체가 한 번에 바뀐다 (reset · heapify 준비) |
 * | `done`          | O   | 없음         | 없음. 한 연산이 끝났다 |
 * | `extract-top`   | ✗   | `index:0`   | `{ value, size }` 꼭대기를 빼내고 끝 값을 올린다 |
 * | `sorted-out`    | ✗   | `index:<i>` | `{ value, slot }` 정렬 중 제자리로 밀려난다 |
 * | `overflow`      | ✗   | 없음         | `{ attempted, capacity }` 담을 자리가 없다 |
 * | `phase`         | ✗   | 없음         | `{ phase }` **silent** — 코드 패널의 줄을 짚기 위한 것 (C3) |
 *
 * ── phase 어휘 (irs.ts 와 글자 단위로 같아야 한다 — C3)
 *
 *   'append' | 'compare-parent' | 'swap-up' | 'settle-up'
 *   'take-top' | 'compare-children' | 'swap-down' | 'settle-down'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   compare-count · swap-count · insert-count · extract-count
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HeapBinaryData = {
  type: 'heap-binary';
  /** 시연에서 하나씩 넣어 볼 값들. */
  seed: number[];
  /** 담을 수 있는 자리 수. */
  capacity: number;
  /** 시연 걸음 간격(ms). 학습자 조작에도 같은 간격을 쓴다. */
  stepMs: number;
};

/** 학습자가 컨트롤바로 보내는 입력. */
type HeapInput =
  | { type: 'input'; payload?: { value?: unknown } }
  | { type: 'insert'; payload?: { value?: unknown } }
  | { type: 'extract' }
  | { type: 'heapify' }
  | { type: 'sort' }
  | { type: string; payload?: { value?: unknown } };

const parentOf = (i: number): number => Math.floor((i - 1) / 2);
const leftOf = (i: number): number => 2 * i + 1;
const rightOf = (i: number): number => 2 * i + 2;

export async function heapBinary(ctx: FacetContext<HeapBinaryData>): Promise<void> {
  const rc = ctx as ReactiveContext<HeapBinaryData>;
  const stepMs = rc.data.stepMs;
  const capacity = rc.data.capacity;

  /** 힙의 내용. `ctx.data` 를 흉내 내지 않고 여기서만 다룬다. */
  let heap: number[] = [];
  /** 정렬로 제자리에 밀려난 값들 — 배열 뒤쪽에 쌓인다. */
  let sorted: number[] = [];
  let lastInput = '';

  /** 걸음 사이의 문. 취소되면 false — 그 자리에서 멈춘다 (C8). */
  const pause = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    return rc.sleep(stepMs);
  };

  const publish = async (): Promise<void> => {
    await rc.emit({
      type: 'state-changed',
      payload: { values: [...heap], sorted: [...sorted] },
      silent: true,
    });
  };

  const phase = async (name: string): Promise<void> => {
    await rc.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /**
   * 두 자리를 견준다. 앞서는 쪽(작은 쪽)이 어디인지 알려 준다.
   *
   * 견줌은 세는 대상이므로 이 함수를 거치지 않고 `<` 를 쓰면 메트릭이 샌다.
   */
  const compare = async (a: number, b: number): Promise<boolean> => {
    const aheadIsA = heap[a]! <= heap[b]!;
    await rc.emit({
      type: 'compare',
      target: `index:${a}`,
      payload: { a, b, aValue: heap[a]!, bValue: heap[b]!, aheadIsA },
    });
    ctx.metric('compare-count', 'inc');
    return aheadIsA;
  };

  const swap = async (a: number, b: number): Promise<void> => {
    const tmp = heap[a]!;
    heap[a] = heap[b]!;
    heap[b] = tmp;
    await rc.emit({ type: 'swap', target: `index:${a}`, payload: { a, b } });
    ctx.metric('swap-count', 'inc');
  };

  /**
   * 끝자리에 앉은 값이 자기 자리를 찾을 때까지 오른다.
   *
   * 꼭대기까지 가는 것이 아니라 **앞서지 못하는 부모를 만나면 멈춘다**.
   */
  const siftUp = async (from: number): Promise<boolean> => {
    let i = from;
    while (i > 0) {
      if (rc.cancelled) return false;
      const p = parentOf(i);
      await phase('compare-parent');
      const childAhead = await compare(i, p);
      if (!(await pause())) return false;
      if (!childAhead) break;
      await phase('swap-up');
      await swap(i, p);
      if (!(await pause())) return false;
      i = p;
    }
    await phase('settle-up');
    await rc.emit({ type: 'mark', target: `index:${i}`, payload: { index: i } });
    return true;
  };

  /**
   * 꼭대기에 올라온 값이 자기 자리를 찾을 때까지 내려간다.
   *
   * **앞선 쪽 자식과 바꿔야 한다.** 아무 쪽과 바꾸면 그 형제가 부모보다 앞서게
   * 되어 힙이 깨진다 — 그래서 자식이 둘이면 먼저 둘을 견준다.
   *
   * `limit` 은 힙으로 볼 범위다. 정렬 중에는 뒤쪽이 이미 제자리라 줄어든다.
   */
  const siftDown = async (from: number, limit: number): Promise<boolean> => {
    let i = from;
    for (;;) {
      if (rc.cancelled) return false;
      const l = leftOf(i);
      const r = rightOf(i);
      if (l >= limit) break;

      let ahead = l;
      if (r < limit) {
        await phase('compare-children');
        const leftAhead = await compare(l, r);
        if (!(await pause())) return false;
        ahead = leftAhead ? l : r;
      }

      await phase('compare-children');
      const parentAhead = await compare(i, ahead);
      if (!(await pause())) return false;
      if (parentAhead) break;

      await phase('swap-down');
      await swap(i, ahead);
      if (!(await pause())) return false;
      i = ahead;
    }
    await phase('settle-down');
    await rc.emit({ type: 'mark', target: `index:${i}`, payload: { index: i } });
    return true;
  };

  /** 값 하나를 넣는다 — 끝자리에 앉히고 위로 올린다. */
  const insert = async (value: number): Promise<boolean> => {
    if (heap.length + sorted.length >= capacity) {
      await rc.emit({ type: 'overflow', payload: { attempted: value, capacity } });
      return true;
    }
    heap.push(value);
    await phase('append');
    await rc.emit({
      type: 'append',
      target: `index:${heap.length - 1}`,
      payload: { value, index: heap.length - 1, size: heap.length },
    });
    ctx.metric('insert-count', 'inc');
    if (!(await pause())) return false;
    return siftUp(heap.length - 1);
  };

  /** 꼭대기를 빼낸다 — 끝 값을 올리고 아래로 내린다. */
  const extract = async (): Promise<{ ok: boolean; value: number | null }> => {
    if (heap.length === 0) return { ok: true, value: null };
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) heap[0] = last;
    await phase('take-top');
    await rc.emit({
      type: 'extract-top',
      target: 'index:0',
      payload: { value: top, size: heap.length },
    });
    ctx.metric('extract-count', 'inc');
    if (!(await pause())) return { ok: false, value: null };
    if (heap.length > 1) {
      if (!(await siftDown(0, heap.length))) return { ok: false, value: null };
    } else if (heap.length === 1) {
      await rc.emit({ type: 'mark', target: 'index:0', payload: { index: 0 } });
    }
    return { ok: true, value: top };
  };

  /**
   * 아무렇게나 놓인 배열을 한 번에 힙으로 만든다.
   *
   * 잎은 이미 그 자체로 힙이므로 건드리지 않는다. 마지막 부모부터 거꾸로
   * 내려보내면 된다 — 그래서 하나씩 넣는 것보다 싸다. 얼마나 싼지는 화면의
   * 견줌 수가 말한다.
   */
  const heapify = async (): Promise<boolean> => {
    const start = parentOf(heap.length - 1);
    for (let i = start; i >= 0; i -= 1) {
      if (rc.cancelled) return false;
      if (!(await siftDown(i, heap.length))) return false;
    }
    return true;
  };

  /**
   * 꼭대기를 계속 빼내면 정렬이 나온다.
   *
   * 뺀 값을 배열 뒤쪽 빈자리에 그대로 두면 자리를 더 쓰지 않는다 — 힙이 앞에서
   * 줄어드는 만큼 정렬된 꼬리가 뒤에서 자란다.
   */
  const sortAll = async (): Promise<boolean> => {
    while (heap.length > 0) {
      if (rc.cancelled) return false;
      const res = await extract();
      if (!res.ok) return false;
      if (res.value !== null) {
        sorted.unshift(res.value);
        await rc.emit({
          type: 'sorted-out',
          target: `index:${heap.length}`,
          payload: { value: res.value, slot: heap.length },
        });
        if (!(await pause())) return false;
      }
    }
    return true;
  };

  // ── 1. 시연. 씨앗 값을 하나씩 넣어 힙이 서는 것을 보인다.
  await publish();
  for (const value of rc.data.seed) {
    if (rc.cancelled) return;
    if (!(await insert(value))) return;
    await publish();
  }
  if (rc.cancelled) return;
  await rc.emit({ type: 'done' });

  // ── 2. 학습자 차례. 무한 입력 루프.
  for (;;) {
    if (rc.cancelled) return;
    let ev: HeapInput;
    try {
      ev = await rc.waitForInput<HeapInput>();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }

    if (ev.type === 'input') {
      const v = ev.payload?.value;
      if (typeof v === 'string') lastInput = v;
      continue;
    }

    if (ev.type === 'insert') {
      const fromPayload = ev.payload?.value;
      const raw =
        typeof fromPayload === 'string' && fromPayload.trim() !== ''
          ? fromPayload.trim()
          : lastInput.trim();
      const parsed = Number.parseInt(raw, 10);
      // 값이 없거나 수가 아니면 1~99 중 하나를 대신 넣는다 — 눌렀는데 아무 일도
      // 일어나지 않으면 컨트롤이 고장 난 것으로 읽힌다.
      const value = Number.isFinite(parsed) ? parsed : 1 + Math.floor(Math.random() * 99);
      if (!(await insert(value))) return;
      await publish();
      await rc.emit({ type: 'done' });
      continue;
    }

    if (ev.type === 'extract') {
      const res = await extract();
      if (!res.ok) return;
      await publish();
      await rc.emit({ type: 'done' });
      continue;
    }

    if (ev.type === 'heapify') {
      // 지금 담긴 값을 섞어 놓고 한 번에 힙으로 만든다. 섞지 않으면 이미 힙이라
      // 아무 일도 일어나지 않아 이 연산이 무엇을 하는지 보이지 않는다.
      const pool = [...heap, ...sorted];
      if (pool.length === 0) continue;
      heap = shuffled(pool);
      sorted = [];
      await publish();
      if (!(await pause())) return;
      if (!(await heapify())) return;
      await publish();
      await rc.emit({ type: 'done' });
      continue;
    }

    if (ev.type === 'sort') {
      if (heap.length === 0) continue;
      if (!(await sortAll())) return;
      await publish();
      await rc.emit({ type: 'done' });
      continue;
    }
  }
}

/**
 * 되풀이해도 같은 자리로 돌아오지 않게 섞는다.
 *
 * 이미 힙인 배열을 그대로 heapify 하면 견줌만 일어나고 자리는 하나도 안 바뀐다 —
 * 그러면 이 연산이 무엇을 하는지 화면이 말하지 못한다.
 */
function shuffled(values: number[]): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
