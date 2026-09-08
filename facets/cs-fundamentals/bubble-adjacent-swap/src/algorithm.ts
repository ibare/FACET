/**
 * 인접 교환 (bubble-adjacent-swap) 알고리즘 — 왼쪽 끝에서 오른쪽 끝까지 한 번 훑는다.
 *
 * 답하는 질문 하나: 옆끼리만 견주는데 어떻게 가장 큰 것이 끝까지 밀려가는가.
 * 답: 견줄 때마다 **선두(지금까지의 최대)가 정확히 한 칸씩 오른쪽으로 옮겨 간다.**
 * 큰 값이 이웃을 넘어 밀려가거나(맞바꿈), 더 큰 이웃에게 선두를 넘기거나 —
 * 어느 쪽이든 선두는 한 칸 나아간다. 그래서 훑기가 끝나면 선두는 오른쪽 끝에 있다.
 * 찾는 걸음은 한 번도 없다.
 *
 * ── 식별자
 *   `index:<n>`  값이 놓인 칸 번호 (0-based).
 *
 * ── 이벤트 (facet 고유. 표준 어휘로는 "선두가 한 칸 나아간다" 를 말할 수 없다)
 *
 * | type            | target                        | payload                                              | silent |
 * |-----------------|-------------------------------|------------------------------------------------------|--------|
 * | `compare-begin` | `['index:l', 'index:r']`      | `{ left, right, leftValue, rightValue }`             | 아니다 |
 * | `swap-adjacent` | `['index:l', 'index:r']`      | `{ left, right, movedValue, stayedValue }`           | 아니다 |
 * | `keep-adjacent` | `['index:l', 'index:r']`      | `{ left, right, leftValue, rightValue }`             | 아니다 |
 * | `pass-settled`  | `index:<last>`                | `{ settledIndex, settledValue, comparisons }`        | 아니다 |
 * | `rewind`        | 없음                          | `{ values: number[] }`                               | 아니다 |
 *
 *   compare-begin  나란한 두 칸을 견주기 시작. 아직 아무것도 옮기지 않았다.
 *   swap-adjacent  왼쪽이 더 컸다. 그 값이 이웃을 넘어 한 칸 오른쪽으로 간다.
 *                  `movedValue` 가 오른쪽으로 간 값, `stayedValue` 가 왼쪽으로 온 값.
 *   keep-adjacent  오른쪽이 이미 컸다. 아무것도 옮기지 않고 선두만 오른쪽으로 넘어간다.
 *   pass-settled   한 번의 훑음이 끝났다. 오른쪽 끝 한 자리가 확정된다.
 *   rewind         `advance` 로 처음부터 다시 짚어 보려고 배치를 되돌린다.
 *
 * ── 메트릭
 *   없다. 조각이므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 *
 * ── 진행
 *   reactive. mount 하면 스스로 한 번 훑고, 그 뒤 `advance` 를 받으면 되감아
 *   처음부터 한 걸음씩 짚는다. 걸음 간격은 `data.stepMs` (저작 결정, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BubbleAdjacentSwapData = {
  type: 'bubble-adjacent-swap';
  /** 왼쪽부터 오른쪽까지 한 번 훑을 값들. 훑는 동안 제자리에서 바뀐다. */
  values: number[];
  /** 걸음 사이에 읽을 시간 (ms). */
  stepMs: number;
};

/** 다음 걸음으로 넘어가는 문. 통과하면 true, 취소로 깨어나면 false. */
type Gate = () => Promise<boolean>;

const DEFAULT_STEP_MS = 700;

/**
 * 한 번의 훑음. 문(gate)을 emit **앞** 에 두되 첫 걸음은 그냥 통과시킨다.
 *
 * 자동 재생이면 문이 `sleep` 이라 걸음 사이가 벌어지고, 한 걸음씩이면 문이
 * `advance` 대기라 누를 때마다 하나씩 나아간다. 첫 문을 통과시키는 것은
 * 되감기 직후의 첫 누름이 아무 반응 없는 것으로 읽히지 않게 하기 위함이다
 * (S-piece — 조각 스물에서 셋이 이 대목만 달랐다).
 */
async function sweepOnce(
  ctx: ReactiveContext<BubbleAdjacentSwapData>,
  gate: Gate,
): Promise<boolean> {
  const values = ctx.data.values;
  let firstStep = true;
  const step = async (): Promise<boolean> => {
    if (firstStep) {
      firstStep = false;
      return true;
    }
    return gate();
  };

  let comparisons = 0;

  for (let i = 0; i + 1 < values.length; i++) {
    if (!(await step())) return false;
    const leftValue = values[i];
    const rightValue = values[i + 1];
    await ctx.emit({
      type: 'compare-begin',
      target: [`index:${i}`, `index:${i + 1}`],
      payload: { left: i, right: i + 1, leftValue, rightValue },
    });
    comparisons += 1;

    if (!(await step())) return false;
    if (leftValue > rightValue) {
      values[i] = rightValue;
      values[i + 1] = leftValue;
      await ctx.emit({
        type: 'swap-adjacent',
        target: [`index:${i}`, `index:${i + 1}`],
        payload: { left: i, right: i + 1, movedValue: leftValue, stayedValue: rightValue },
      });
    } else {
      await ctx.emit({
        type: 'keep-adjacent',
        target: [`index:${i}`, `index:${i + 1}`],
        payload: { left: i, right: i + 1, leftValue, rightValue },
      });
    }
  }

  if (!(await step())) return false;
  const last = values.length - 1;
  await ctx.emit({
    type: 'pass-settled',
    target: `index:${last}`,
    payload: { settledIndex: last, settledValue: values[last], comparisons },
  });
  return true;
}

/**
 * 인접 교환 조각의 알고리즘.
 *
 * `ReactiveMechanism` 이 mount 직후 스스로 부른다. 자동으로 한 번 훑은 뒤
 * `advance` 입력을 기다렸다가, 받으면 되감고 한 걸음씩 다시 짚는다.
 */
export const bubbleAdjacentSwap = async (
  ctx: FacetContext<BubbleAdjacentSwapData>,
): Promise<void> => {
  const rx = ctx as ReactiveContext<BubbleAdjacentSwapData>;
  const stepMs = typeof rx.data.stepMs === 'number' ? rx.data.stepMs : DEFAULT_STEP_MS;
  const initialValues = [...rx.data.values];

  /** 자동 재생 — 걸음 사이를 stepMs 만큼 벌린다. */
  const autoGate: Gate = () => rx.sleep(stepMs);

  /** 한 걸음씩 — `advance` 를 받을 때까지 기다린다. */
  const advanceGate: Gate = async () => {
    for (;;) {
      const input = await rx.waitForInput();
      if (input.type === 'advance') return true;
    }
  };

  await sweepOnce(rx, autoGate);

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해, 누르면 되감고
  // 처음부터 한 걸음씩 짚는다. 첫 누름에 되감기와 첫 걸음이 함께 보인다.
  for (;;) {
    const input = await rx.waitForInput();
    if (input.type !== 'advance') continue;
    rx.data.values.splice(0, rx.data.values.length, ...initialValues);
    await rx.emit({ type: 'rewind', payload: { values: [...initialValues] } });
    if (!(await sweepOnce(rx, advanceGate))) return;
  }
};
