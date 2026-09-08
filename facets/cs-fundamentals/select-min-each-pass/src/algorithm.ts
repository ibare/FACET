/**
 * selectMinEachPass — 한 바퀴를 다 훑고 나서야 가장 작은 것을 집는다.
 *
 * 훑는 눈길과 별개로 "지금까지 가장 작았던 자리" 표식이 있고, 더 작은 것을
 * 만날 때만 표식이 새 자리로 건너간다. 훑는 동안 값은 하나도 움직이지 않으며,
 * 다 훑은 뒤에 비로소 한 번 옮긴다. 견줌은 많고 이동은 적다.
 *
 * 식별자
 *   index:<i>   값이 든 칸의 자리 번호
 *
 * 이벤트 (전부 이 facet 고유 확장 — C2)
 *   mark-init   { index: number; value: number }
 *               후보 표식을 첫 자리에 놓는다. 아직 아무것도 견주지 않았다.
 *   scan-step   { index: number; value: number; bestIndex: number;
 *                 bestValue: number; smaller: boolean; compares: number }
 *               눈길이 한 칸 옮겨 가 표식이 쥔 값과 견준다. 값은 건드리지 않는다.
 *   mark-hop    { from: number; to: number; value: number; hops: number }
 *               더 작았으므로 표식만 새 자리로 건너간다.
 *   scan-end    { compares: number; hops: number }
 *               훑기가 끝났다. 여기까지 옮겨진 값은 하나도 없다.
 *   value-move  { from: number; to: number; values: number[] }
 *               비로소 한 번. 표식이 가리킨 값과 맨 앞 값이 자리를 맞바꾼다.
 *   done        { compares: number; moves: number }   (표준 어휘)
 *               한 바퀴의 셈 — 견줌 몇 번, 이동 몇 번.
 *   rewind      payload 없음
 *               처음 상태로 되감는다 (advance 로 다시 짚어 볼 때).
 *
 * silent 이벤트는 없다. 일곱 가지 모두 화면이 바뀌는 걸음이다.
 * 메트릭은 부르지 않는다 — 조각은 셀 것을 패널로 두지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SelectMinEachPassData = {
  type: 'select-min-each-pass';
  /** 훑을 값들. 이 배열이 걸음 수를 정한다. */
  values: number[];
  /** 걸음 사이에 두는 읽을 시간. 저작 결정이라 선언에 있다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 750;

/**
 * `advance` 가 올 때까지 기다린다. 다른 입력은 흘려보낸다 — 컨트롤이 replay 와
 * advance 뿐이라 지금은 무해하지만, 걸음을 옮기는 것은 advance 하나여야 한다.
 * 취소되면 waitForInput 이 reject 한다.
 */
async function waitForAdvance(ctx: ReactiveContext<SelectMinEachPassData>): Promise<void> {
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (input.type === 'advance') return;
  }
}

export async function selectMinEachPass(
  base: FacetContext<SelectMinEachPassData>,
): Promise<void> {
  const ctx = base as ReactiveContext<SelectMinEachPassData>;
  const source = Array.isArray(ctx.data.values) ? [...ctx.data.values] : [];
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;
  if (source.length === 0) return;

  // 자동 재생을 마친 뒤에는 advance 한 번이 걸음 하나가 된다.
  let manual = false;
  // 되감은 직후의 첫 문은 그냥 통과시킨다 — 그 누름이 이미 첫 걸음을 뜻한다 (S-piece).
  let freeGate = false;

  /** 걸음과 걸음 사이의 문. 취소되면 false 를 돌려 바깥이 조용히 빠져나가게 한다. */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    await waitForAdvance(ctx);
    return !ctx.cancelled;
  };

  const playPass = async (): Promise<void> => {
    const values = [...source];
    let best = 0;
    let compares = 0;
    let hops = 0;

    if (!(await gate())) return;
    await ctx.emit({
      type: 'mark-init',
      target: 'index:0',
      payload: { index: 0, value: values[0] },
    });

    for (let j = 1; j < values.length; j += 1) {
      if (!(await gate())) return;
      compares += 1;
      const smaller = values[j] < values[best];
      await ctx.emit({
        type: 'scan-step',
        target: `index:${j}`,
        payload: {
          index: j,
          value: values[j],
          bestIndex: best,
          bestValue: values[best],
          smaller,
          compares,
        },
      });
      if (!smaller) continue;
      hops += 1;
      const from = best;
      best = j;
      await ctx.emit({
        type: 'mark-hop',
        target: `index:${j}`,
        payload: { from, to: j, value: values[j], hops },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'scan-end', payload: { compares, hops } });

    let moves = 0;
    if (best !== 0) {
      if (!(await gate())) return;
      const held = values[0];
      values[0] = values[best];
      values[best] = held;
      moves = 1;
      await ctx.emit({
        type: 'value-move',
        target: ['index:0', `index:${best}`],
        payload: { from: best, to: 0, values: [...values] },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: { compares, moves } });
  };

  await playPass();

  // 자동 재생이 끝났다. 이제 누를 때마다 한 걸음씩 다시 짚는다.
  for (;;) {
    await waitForAdvance(ctx);
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    manual = true;
    freeGate = true;
    await playPass();
  }
}
