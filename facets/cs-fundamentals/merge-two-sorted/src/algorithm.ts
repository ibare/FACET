/**
 * 병합 조각 — 줄 선 둘의 **맨 앞**만 견주고 이긴 쪽이 아래 결과줄로 내려간다.
 *
 * 답하는 질문: 정렬된 두 줄을 합칠 때 다시 정렬하는가?
 * 답: 하지 않는다. 양쪽이 이미 줄 서 있으므로 맨 앞 둘만 봐도 다음에 올 것이
 * 확정된다. 뒤쪽은 한 번도 쳐다보지 않는다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장, C2)
 *
 *   compare  { leftIndex: number; rightIndex: number;
 *              leftValue: number; rightValue: number; winner: 'left' | 'right' }
 *            두 줄의 맨 앞끼리 한 번 견준다. 한쪽이 바닥나면 발신되지 않는다.
 *            silent 아님 (견줌 자체가 화면에 뜬다).
 *
 *   take     { side: 'left' | 'right'; index: number; value: number;
 *              slot: number; compared: boolean }
 *            이긴 쪽(compared=true) 또는 남은 쪽(compared=false)이 결과줄의
 *            slot 자리로 내려간다. silent 아님.
 *
 *   rewind   payload 없음. 자동 재생을 마친 뒤 `advance` 로 한 걸음씩 다시
 *            짚을 때, 화면을 처음 상태로 되감는다. silent 아님 (화면이 바뀐다).
 *
 *   done     { comparisons: number; picks: number }
 *            합치기가 끝났다. 견줌 횟수는 이 루프가 실제로 센 값이다.
 *            silent 아님.
 *
 * `target` 은 쓰지 않는다. 이 조각의 자리는 "어느 줄의 몇 번째" 와 "결과줄의
 * 몇 번째" 두 축이라 표준 prefix (`index:` / `list:` …) 로 접히지 않는다. 새
 * prefix 를 만드는 대신 payload 를 정규 경로로 둔다 (C1 은 target 을 **파싱할
 * 때** 의 규율이며, projector 도 target 을 읽지 않는다).
 *
 * 메트릭 없음 — 조각은 셀 것이 없다 (S-piece).
 *
 * ── 진행
 *
 * mechanismKind 는 'reactive' 다. mount 하면 스스로 한 번 재생하고, 그 뒤로는
 * `advance` 입력을 기다리며 처음부터 한 걸음씩 다시 보여 준다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MergeTwoSortedData = {
  type: string;
  /** 왼쪽 줄. 이미 오름차순으로 서 있다. */
  left: number[];
  /** 오른쪽 줄. 이미 오름차순으로 서 있다. */
  right: number[];
  /** 걸음 간격(ms). 읽을 시간을 주는 것은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

/**
 * 걸음 사이의 문(gate).
 *
 * 자동 재생에서는 `ctx.sleep` 이고, 한 걸음씩 볼 때는 `advance` 입력 대기다.
 * 걸음마다 emit **앞**에 놓이므로, 되감기 직후의 첫 문만 그냥 통과시키면
 * 첫 누름이 "되감고 첫 걸음까지" 가 된다 (S-piece).
 *
 * @returns 계속 진행해도 되면 true, 취소로 깨어났으면 false.
 */
type Gate = () => Promise<boolean>;

/** `advance` 가 올 때까지 기다린다. 취소되면 waitForInput 이 reject 한다. */
async function waitForAdvance(ctx: ReactiveContext<MergeTwoSortedData>): Promise<void> {
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (input.type === 'advance') return;
  }
}

/**
 * 합치기 한 판. 문(gate)을 바꿔 끼우면 자동 재생과 한 걸음씩 보기가 같은
 * 걸음을 밟는다 — 걸음표를 따로 적지 않는다 (S-piece).
 */
async function mergeOnce(ctx: ReactiveContext<MergeTwoSortedData>, gate: Gate): Promise<void> {
  const left = ctx.data.left;
  const right = ctx.data.right;
  let i = 0;
  let j = 0;
  let slot = 0;
  let comparisons = 0;

  while (i < left.length || j < right.length) {
    if (ctx.cancelled) return;

    const leftLive = i < left.length;
    const rightLive = j < right.length;
    // 견줄 상대가 양쪽에 다 있을 때만 견준다. 한쪽이 바닥나면 남은 쪽은
    // 견줌 없이 그대로 따라 내려간다.
    const compared = leftLive && rightLive;

    let fromLeft = leftLive;
    if (compared) {
      const a = left[i];
      const b = right[j];
      fromLeft = a <= b;
      comparisons += 1;
      if (!(await gate())) return;
      await ctx.emit({
        type: 'compare',
        payload: {
          leftIndex: i,
          rightIndex: j,
          leftValue: a,
          rightValue: b,
          winner: fromLeft ? 'left' : 'right',
        },
      });
      if (ctx.cancelled) return;
    }

    const index = fromLeft ? i : j;
    const value = fromLeft ? left[i] : right[j];
    if (!(await gate())) return;
    await ctx.emit({
      type: 'take',
      payload: { side: fromLeft ? 'left' : 'right', index, value, slot, compared },
    });
    if (ctx.cancelled) return;

    if (fromLeft) i += 1;
    else j += 1;
    slot += 1;
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done', payload: { comparisons, picks: slot } });
}

export const mergeTwoSortedAlgorithm = async (
  rawCtx: FacetContext<MergeTwoSortedData>,
): Promise<void> => {
  const ctx = rawCtx as ReactiveContext<MergeTwoSortedData>;
  const stepMs = ctx.data.stepMs > 0 ? ctx.data.stepMs : 700;

  // 1) 자동 재생 — 누르지 않아도 화면은 할 말을 마친다.
  await mergeOnce(ctx, () => ctx.sleep(stepMs));

  // 2) 그 뒤로는 곱씹으며 읽고 싶은 사람을 기다린다. 처음 누르는 advance 는
  //    되감고 첫 걸음까지 보인다 (되감기만 하면 눌러도 반응 없는 것으로 읽힌다).
  for (;;) {
    if (ctx.cancelled) return;
    await waitForAdvance(ctx);
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;

    let firstGate = true;
    await mergeOnce(ctx, async () => {
      if (firstGate) {
        firstGate = false;
        return true;
      }
      await waitForAdvance(ctx);
      return !ctx.cancelled;
    });
  }
};
