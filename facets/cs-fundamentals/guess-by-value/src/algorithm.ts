/**
 * guess-by-value — 값의 크기로 자리를 겨누는 조각(piece) 알고리즘.
 *
 * 한 배열을 두 방식이 나란히 훑는다. 위 줄은 늘 가운데를 짚는 쪽(이진 탐색),
 * 아래 줄은 양 끝 값과 찾는 값이 만드는 비율을 자리 번호로 옮겨 겨누는
 * 쪽(보간 탐색)이다. 걸음 수는 두 방식 모두 알고리즘이 스스로 세고, 화면은
 * 그 수를 받아 적기만 한다.
 *
 * ── 식별자
 *   `index:<i>`  배열의 i 번 자리. 어느 줄의 자리인지는 payload.lane 이 가른다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장 · silent 없음 · C2)
 *   'range-set'    { lo: number; hi: number }
 *                  가운데를 짚는 쪽의 남은 구간. 처음 한 번.
 *   'probe'        target `index:<i>`
 *                  { lane: 'middle' | 'aim'; index: number; value: number;
 *                    count: number; hit: boolean }
 *                  한 자리를 짚었다. count 는 그 줄이 지금까지 짚은 횟수.
 *   'discard-half' { side: 'left' | 'right'; lo: number; hi: number;
 *                    pivotValue: number; target: number }
 *                  짚은 값이 목표와 어긋나 절반이 빠진다. 남은 구간이 lo..hi.
 *   'lane-settled' { lane: 'middle' | 'aim'; count: number }
 *                  그 줄이 할 일을 마쳤다. 커서와 구간 표시를 거둔다.
 *   'scale-set'    { loIndex: number; hiIndex: number;
 *                    loValue: number; hiValue: number }
 *                  겨누는 쪽이 양 끝 값을 자로 삼는다. 자의 두 끝이 그 두 자리다.
 *   'aim-measure'  { target: number; loValue: number; hiValue: number;
 *                    fraction: number }
 *                  찾는 값이 자 위 어디쯤인지 재는 중. fraction 은 0..1.
 *   'aim-land'     { index: number; fraction: number }
 *                  잰 비율이 자리 번호로 떨어진다.
 *   'rewind'       payload 없음. 한 걸음씩 되짚기 위해 처음으로 되감는다.
 *   'done'         { aimProbes: number; midProbes: number }
 *                  두 방식이 각각 몇 번 짚었는지.
 *
 * ── 진행
 *   reactive 메커니즘. mount 즉시 자동 재생하고, 다 마치면 `advance` 입력을
 *   기다린다. 첫 `advance` 는 되감고 첫 걸음까지 보이며, 그 뒤로는 한 번에
 *   한 걸음씩 나아간다 (S-piece).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것을 패널에 두지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GuessByValueData = {
  type: 'guess-by-value';
  /** 오름차순으로 고르게 퍼진 값들. 두 줄이 같은 배열을 훑는다. */
  values: number[];
  /** 찾는 값. */
  target: number;
  /** 걸음 사이 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const CANCELLED = 'cancelled';

export async function guessByValueAlgorithm(
  base: FacetContext<GuessByValueData>,
): Promise<void> {
  const ctx = base as ReactiveContext<GuessByValueData>;
  const values = ctx.data.values;
  const target = ctx.data.target;
  const stepMs = ctx.data.stepMs;
  const n = values.length;
  if (n === 0) return;

  /** 자동 재생을 마친 뒤에는 걸음마다 `advance` 를 기다린다. */
  let manual = false;
  /** 되감은 직후의 첫 문은 그냥 통과시킨다 — 첫 누름이 첫 걸음까지 보이도록. */
  let passOneGate = false;

  async function waitAdvance(): Promise<void> {
    for (;;) {
      const ev = await ctx.waitForInput();
      if (ev.type === 'advance') return;
    }
  }

  /** 걸음 사이의 문. 자동일 때는 시간이, 수동일 때는 사용자가 연다. */
  async function gate(): Promise<void> {
    if (ctx.cancelled) throw new Error(CANCELLED);
    if (manual) {
      if (passOneGate) {
        passOneGate = false;
        return;
      }
      await waitAdvance();
      return;
    }
    const ok = await ctx.sleep(stepMs);
    if (!ok || ctx.cancelled) throw new Error(CANCELLED);
  }

  /** 늘 가운데를 짚는 쪽. 짚은 횟수를 돌려준다. */
  async function walkMiddle(): Promise<number> {
    let lo = 0;
    let hi = n - 1;
    let count = 0;

    await gate();
    await ctx.emit({ type: 'range-set', payload: { lo, hi } });

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const value = values[mid];
      const hit = value === target;
      count += 1;

      await gate();
      await ctx.emit({
        type: 'probe',
        target: `index:${mid}`,
        payload: { lane: 'middle', index: mid, value, count, hit },
      });
      if (hit) break;

      if (value < target) {
        lo = mid + 1;
        await ctx.emit({
          type: 'discard-half',
          payload: { side: 'left', lo, hi, pivotValue: value, target },
        });
      } else {
        hi = mid - 1;
        await ctx.emit({
          type: 'discard-half',
          payload: { side: 'right', lo, hi, pivotValue: value, target },
        });
      }
    }

    await ctx.emit({ type: 'lane-settled', payload: { lane: 'middle', count } });
    return count;
  }

  /** 값의 크기로 겨누는 쪽. 짚은 횟수를 돌려준다. */
  async function walkAim(): Promise<number> {
    let lo = 0;
    let hi = n - 1;
    let count = 0;

    while (lo <= hi) {
      const loValue = values[lo];
      const hiValue = values[hi];
      // 찾는 값이 남은 구간의 두 끝 밖이면 겨눌 자리가 없다.
      if (target < loValue || target > hiValue) break;

      const denom = hiValue - loValue;
      const fraction = denom === 0 ? 0 : (target - loValue) / denom;
      const index = lo + (denom === 0 ? 0 : Math.floor(fraction * (hi - lo)));

      await gate();
      await ctx.emit({
        type: 'scale-set',
        payload: { loIndex: lo, hiIndex: hi, loValue, hiValue },
      });

      await gate();
      await ctx.emit({
        type: 'aim-measure',
        payload: { target, loValue, hiValue, fraction },
      });

      await gate();
      await ctx.emit({ type: 'aim-land', payload: { index, fraction } });

      const value = values[index];
      const hit = value === target;
      count += 1;

      await gate();
      await ctx.emit({
        type: 'probe',
        target: `index:${index}`,
        payload: { lane: 'aim', index, value, count, hit },
      });
      if (hit) break;

      if (value < target) lo = index + 1;
      else hi = index - 1;
    }

    await ctx.emit({ type: 'lane-settled', payload: { lane: 'aim', count } });
    return count;
  }

  async function runOnce(): Promise<void> {
    const midProbes = await walkMiddle();
    const aimProbes = await walkAim();
    await gate();
    await ctx.emit({ type: 'done', payload: { aimProbes, midProbes } });
  }

  for (;;) {
    await runOnce();
    // 자동 재생이 끝났다. 다음 `advance` 는 되감고 첫 걸음까지 보인다.
    await waitAdvance();
    if (ctx.cancelled) throw new Error(CANCELLED);
    manual = true;
    passOneGate = true;
    await ctx.emit({ type: 'rewind' });
  }
}
