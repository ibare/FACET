/**
 * 힙 정렬 — 배열을 먼저 최대 힙으로 만들고, 꼭대기를 꺼내 뒤에 쌓기를 되풀이한다.
 *
 * 두 축을 말한다.
 *   1. **배열 한 줄이 곧 트리다** — 자리 `i` 의 자식은 `2i+1` 과 `2i+2` 다.
 *      자리 번호의 셈이 부모-자식 관계이므로 포인터가 없다.
 *   2. **자리를 빌리지 않는다** — 꺼낸 값이 앉을 자리가 마침 힙이 줄면서 나오는
 *      칸이다. 꼭대기와 끝을 맞바꾸고 힙을 한 칸 줄이면 그 칸은 끝난 것이다.
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸 번호가 전부다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                     silent: true
 *   - build-begin    payload { size, firstParent }
 *   - build-end      payload { top }
 *   - sift-begin     target `index:<i>`  payload { index, size, origin }
 *   - highlight      target [`index:<a>`, `index:<b>`]
 *                    payload { kind: 'children', parent, left, right, leftValue, rightValue, bigger }
 *                          | { kind: 'parent-child', parent, child, parentValue, childValue }
 *   - state-changed  target [`index:<i>`, `index:<j>`]
 *                    payload { kind: 'move-down' | 'swap-top-end', i, j, aValue, bValue }
 *   - sift-end       target `index:<i>`  payload { index, value, origin }
 *   - mark           target `index:<last>` (마지막은 `index:0`)
 *                    payload { kind: 'sorted', index, value }
 *   - heap-shrink    payload { size }
 *   - done           payload { compares, swaps, settled }
 *
 * `unhighlight` 를 쓰지 않는다. 견줌 표시는 다음 걸음이 시작될 때 갈아 끼우는
 * 것이 자연스러워, projector 가 `highlight` / `state-changed` / `sift-begin` /
 * `sift-end` 를 받을 때마다 이전 표시를 거둔다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'build-heap' | 'compare-children' | 'move-down' | 'settle-down' |
 *   'swap-top-end' | 'shrink-heap' | 'sift-root'
 *
 * 사양이 요구한 여섯 국면과의 대응 —
 *   힙 만들기 = build-heap · 자식과 견줌 = compare-children ·
 *   아래로 내림 = move-down · 꼭대기와 끝 맞바꿈 = swap-top-end ·
 *   힙 줄임 = shrink-heap · 자리 확정 = settle-down.
 * `sift-root` 은 줄어든 힙을 다시 정돈하러 꼭대기로 돌아가는 줄이라 하나 더 두었다.
 *
 * 메트릭 (C5): 'compare-count' · 'swap-count' · 'sorted-count'
 *
 * 견줌은 코드의 두 `if` 를 그대로 센다 — 오른쪽 자식이 있을 때의 "둘 중 큰 쪽"
 * 한 번과 "부모가 이미 큰가" 한 번. 맞바꿈은 아래로 내리는 것과 꼭대기-끝을
 * 맞바꾸는 것을 함께 센다. [64,25,12,22,11,90,34] 에서 견줌 19 · 맞바꿈 13 이다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type HeapSortData = { type: 'array'; values: number[] };

/** 어느 루프에서 내려온 sift 인지. `sift-begin` / `sift-end` payload 의 `origin`. */
type SiftOrigin = 'build' | 'extract';

export async function heapSort(ctx: FacetContext<HeapSortData>): Promise<void> {
  const arr = ctx.data.values;
  const n = arr.length;
  let compares = 0;
  let swaps = 0;
  let settled = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /**
   * 자리 `start` 의 값을 힙 성질이 회복될 때까지 아래로 내린다.
   * `size` 는 지금 힙에 속한 칸 수 — 그 바깥은 이미 자리가 확정된 꼬리다.
   */
  async function siftDown(size: number, start: number, origin: SiftOrigin): Promise<void> {
    let i = start;
    await ctx.emit({
      type: 'sift-begin',
      target: `index:${i}`,
      payload: { index: i, size, origin },
    });

    for (;;) {
      if (ctx.cancelled) return;

      const left = 2 * i + 1;
      if (left >= size) break;
      const right = 2 * i + 2;
      let big = left;

      if (right < size) {
        await phase('compare-children');
        compares++;
        ctx.metric('compare-count', 'inc');
        if (arr[right] > arr[left]) big = right;
        await ctx.emit({
          type: 'highlight',
          target: [`index:${left}`, `index:${right}`],
          payload: {
            kind: 'children',
            parent: i,
            left,
            right,
            leftValue: arr[left],
            rightValue: arr[right],
            bigger: big,
          },
        });
      }

      if (ctx.cancelled) return;

      await phase('compare-children');
      compares++;
      ctx.metric('compare-count', 'inc');
      await ctx.emit({
        type: 'highlight',
        target: [`index:${i}`, `index:${big}`],
        payload: {
          kind: 'parent-child',
          parent: i,
          child: big,
          parentValue: arr[i],
          childValue: arr[big],
        },
      });
      if (arr[i] >= arr[big]) break;

      await phase('move-down');
      const parentValue = arr[i];
      const childValue = arr[big];
      arr[i] = childValue;
      arr[big] = parentValue;
      swaps++;
      ctx.metric('swap-count', 'inc');
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${i}`, `index:${big}`],
        payload: { kind: 'move-down', i, j: big, aValue: parentValue, bValue: childValue },
      });
      i = big;
    }

    if (ctx.cancelled) return;
    await phase('settle-down');
    await ctx.emit({
      type: 'sift-end',
      target: `index:${i}`,
      payload: { index: i, value: arr[i], origin },
    });
  }

  if (n === 0) {
    if (!ctx.cancelled) {
      await ctx.emit({ type: 'done', payload: { compares, swaps, settled } });
    }
    return;
  }

  // ── 힙 만들기 — 자식을 가진 마지막 자리부터 거꾸로 ──────────────────
  const firstParent = Math.floor(n / 2) - 1;
  await ctx.emit({ type: 'build-begin', payload: { size: n, firstParent } });
  for (let i = firstParent; i >= 0; i--) {
    if (ctx.cancelled) return;
    await phase('build-heap');
    await siftDown(n, i, 'build');
  }
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'build-end', payload: { top: arr[0] } });

  // ── 꼭대기를 꺼내 뒤에 쌓기 ────────────────────────────────────────
  let size = n;
  while (size > 1) {
    if (ctx.cancelled) return;

    await phase('swap-top-end');
    const last = size - 1;
    const topValue = arr[0];
    const tailValue = arr[last];
    arr[0] = tailValue;
    arr[last] = topValue;
    swaps++;
    ctx.metric('swap-count', 'inc');
    await ctx.emit({
      type: 'state-changed',
      target: ['index:0', `index:${last}`],
      payload: { kind: 'swap-top-end', i: 0, j: last, aValue: topValue, bValue: tailValue },
    });

    await phase('shrink-heap');
    size = size - 1;
    settled++;
    ctx.metric('sorted-count', 'inc');
    await ctx.emit({
      type: 'mark',
      target: `index:${last}`,
      payload: { kind: 'sorted', index: last, value: arr[last] },
    });
    await ctx.emit({ type: 'heap-shrink', payload: { size } });

    if (ctx.cancelled) return;
    await phase('sift-root');
    await siftDown(size, 0, 'extract');
  }

  if (ctx.cancelled) return;

  // 힙에 한 칸만 남으면 그 값이 가장 작다 — 더 꺼낼 것 없이 자리가 확정된다.
  settled++;
  ctx.metric('sorted-count', 'inc');
  await ctx.emit({
    type: 'mark',
    target: 'index:0',
    payload: { kind: 'sorted', index: 0, value: arr[0] },
  });
  await ctx.emit({ type: 'done', payload: { compares, swaps, settled } });
}
