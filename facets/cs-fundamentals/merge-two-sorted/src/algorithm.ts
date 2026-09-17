/**
 * 병합 조각 — 줄 선 둘의 **맨 앞**만 견주고 이긴 쪽이 아래 결과줄로 내려간다.
 *
 * 답하는 질문: 정렬된 두 줄을 합칠 때 다시 정렬하는가?
 * 답: 하지 않는다. 양쪽이 이미 줄 서 있으므로 맨 앞 둘만 봐도 다음에 올 것이
 * 확정된다. 뒤쪽은 한 번도 쳐다보지 않는다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장, C2)
 *
 *   compare  payload 없음. 두 줄의 맨 앞끼리 한 번 견준다. 한쪽이 바닥나면
 *            발신되지 않는다. 어느 둘을 견주었는지도, 몇 번째 견줌인지도 싣지
 *            않는다 — 지금까지 무엇을 꺼냈는지가 그것을 이미 말한다.
 *            silent 아님 (견줌 자체가 화면에 뜬다).
 *
 *   take     { side: 'left' | 'right' }
 *            그 줄의 맨 앞이 결과줄로 내려간다. **어느 쪽인가만 싣는다** —
 *            그것이 이 알고리즘이 내리는 유일한 판정이다. 자리도 값도 내려앉을
 *            칸 번호도 걸어온 자취에서 나온다. silent 아님.
 *
 *   rewind   payload 없음. 자동 재생을 마친 뒤 `advance` 로 한 걸음씩 다시
 *            짚을 때, 화면을 처음 상태로 되감는다. silent 아님 (화면이 바뀐다).
 *
 *   done     payload 없음. 합치기가 끝났다. 견줌 횟수는 화면 쪽이 발신을 세어
 *            얻는다 — 같은 수를 두 곳에서 세지 않는다. silent 아님.
 *
 * `target` 은 쓰지 않는다. 이 조각의 자리는 "어느 줄의 몇 번째" 와 "결과줄의
 * 몇 번째" 두 축이라 표준 prefix (`index:` / `list:` …) 로 접히지 않는다. 그런데
 * 그 두 축이 **꺼낸 자취에서 그대로 셈해지므로** 자리를 실어 보낼 일 자체가 없다
 * — 새 prefix 도, 자리를 담은 payload 도 필요 없다 (`scene.ts` 의 `headsOf`).
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

  while (i < left.length || j < right.length) {
    if (ctx.cancelled) return;

    const leftLive = i < left.length;
    const rightLive = j < right.length;

    // 견줄 상대가 양쪽에 다 있을 때만 견준다. 한쪽이 바닥나면 남은 쪽은
    // 견줌 없이 그대로 따라 내려간다.
    let fromLeft = leftLive;
    if (leftLive && rightLive) {
      fromLeft = left[i] <= right[j];
      if (!(await gate())) return;
      await ctx.emit({ type: 'compare' });
      if (ctx.cancelled) return;
    }

    if (!(await gate())) return;
    // 싣는 것은 **판정 하나**다. 어느 자리에서 몇 번째 칸으로 가는지는 걸어온
    // 자취가 이미 말하므로, 여기서 세어 보내면 같은 수를 두 곳에서 세게 된다.
    await ctx.emit({ type: 'take', payload: { side: fromLeft ? 'left' : 'right' } });
    if (ctx.cancelled) return;

    if (fromLeft) i += 1;
    else j += 1;
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done' });
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
