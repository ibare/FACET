/**
 * square-and-halve — 분할 거듭제곱 조각(piece)의 알고리즘.
 *
 * 질문 하나에 답한다: 3 을 열세 번 곱하지 않고 여섯 번만 곱해 3¹³ 에 닿는 것이
 * 어떻게 가능한가.
 *
 * 지수만큼의 칸이 늘어선 줄을 반으로 접는다. 짝지은 둘이 만나 한 칸이 되고 그
 * 칸의 값은 앞 값의 제곱이다. 칸 수가 홀수면 짝 없는 한 칸이 남고, 남는 그 칸을
 * 답으로 보낸다. 답으로 보낸 칸이 곧 지수를 이진수로 적었을 때의 1 자리다.
 *
 * 1차 데이터는 밑과 지수 둘뿐이다. 9 · 81 · 6561 · 243 · 1594323 은 어디에도
 * 적혀 있지 않고 아래 순회가 그 자리에서 셈한다 (S-piece).
 *
 * ── 이벤트 (type 은 모두 리터럴, C2)
 *
 *   begin  { base, exponent, naive }
 *          줄을 처음 세운다. 칸 수는 exponent, 칸마다의 값은 base,
 *          하나씩 곱을 때 드는 곱셈 횟수는 naive.
 *   take   { place, count, factor, product }
 *          칸 수 count 가 홀수라 남는 한 칸을 답으로 보낸다. place 는 그 칸이
 *          덮는 지수 폭(1·2·4·8…) 이고 factor 는 칸의 값, product 는 누적 곱.
 *   skip   { place, count }
 *          칸 수 count 가 짝수라 답으로 갈 것이 없다. place 는 그 자리의 지수 폭.
 *   fold   { row, count, value }
 *          반으로 접는다. row 는 새 줄의 번호(0부터), count 는 새 칸 수,
 *          value 는 새 칸 하나의 값 — 앞 값의 제곱.
 *   done   { product, squarings, multiplies, total, naive, bits }
 *          bits 는 지수의 이진 표기를 큰 자리부터 담은 0/1 배열.
 *   rewind {}
 *          자동 재생을 마친 뒤 advance 를 처음 누르면 되감는다.
 *
 * silent 이벤트는 없다 — 여섯 종 모두 화면이 바뀌는 걸음이다.
 * `ctx.metric` 은 부르지 않는다. 조각은 계기를 두지 않는다 (S-piece).
 */

import type {
  FacetContext,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

export type SquareAndHalveData = {
  type: 'square-and-halve';
  /** 밑. 처음 줄의 칸마다 적히는 값. */
  base: number;
  /** 지수. 처음 줄의 칸 수. */
  exponent: number;
  /** 걸음 하나가 끝난 뒤 쉬는 시간. 읽을 시간을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 걸음 사이의 문. 이어 가면 true, 취소로 깨어났으면 false. */
type Gate = () => Promise<boolean>;

/**
 * advance 가 올 때까지 기다린다.
 *
 * 받은 것의 종류를 본다 — 지금은 메커니즘이 reset/speed 를 스스로 처리하지만,
 * 위젯 입력이 하나라도 붙는 순간 그것까지 걸음으로 세게 된다 (S-piece).
 */
async function nextAdvance(rc: ReactiveContext<SquareAndHalveData>): Promise<boolean> {
  for (;;) {
    // waitForInput 이 취소 시 throw 하더라도 그 규약에 기대지 않는다 — 이 루프가
    // 조각의 가장 바깥이라 여기서 새면 아무도 못 잡는다 (C8).
    if (rc.cancelled) return false;
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
      if (!rc.cancelled) throw err;
      return false;
    }
    if (rc.cancelled) return false;
    if (input.type === 'advance') return true;
  }
}

/**
 * 걸음 사이의 문을 만든다.
 *
 * 첫 걸음 앞에는 기다릴 앞걸음이 없다 — 문을 먼저 두면 stepMs 만큼 빈 화면이
 * 보인 뒤에야 그림이 선다. 되감기 직후의 첫 문도 같은 이유로 그냥 통과시킨다.
 * 그래야 처음 누르는 advance 가 되감고 첫 걸음까지 간다 (S-piece).
 */
function makeGate(
  rc: ReactiveContext<SquareAndHalveData>,
  stepMs: number,
  stepwise: boolean,
): Gate {
  let first = true;
  return async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    if (first) {
      first = false;
      return true;
    }
    if (!stepwise) return rc.sleep(stepMs);
    return nextAdvance(rc);
  };
}

/**
 * 한 바퀴 재생한다.
 *
 * 걸음표를 손으로 적어 두르지 않는다 — 아래 순회가 곧 그 연산이다 (C2).
 */
async function playOnce(
  rc: ReactiveContext<SquareAndHalveData>,
  gate: Gate,
): Promise<void> {
  const base = rc.data.base;
  const exponent = Math.max(0, Math.floor(rc.data.exponent));
  /** 하나씩 곱을 때의 곱셈 횟수. 칸 열셋을 잇는 데 드는 곱셈은 열둘이다. */
  const naive = Math.max(0, exponent - 1);

  if (!(await gate())) return;
  await rc.emit({ type: 'begin', payload: { base, exponent, naive } });

  /** 남은 칸 수. 곧 남은 지수다. */
  let count = exponent;
  /** 칸 하나의 값. 접을 때마다 제 자신을 곱한다. */
  let cell = base;
  /** 칸 하나가 덮는 지수 폭. 이진수의 자릿값이기도 하다. */
  let place = 1;
  let product = 1;
  let row = 0;
  let squarings = 0;
  let multiplies = 0;
  /** 지수의 이진 표기. 작은 자리부터 쌓이므로 마지막에 뒤집는다. */
  const bits: number[] = [];

  while (count > 0) {
    // 문(gate)을 바디 첫 줄에 둘 수 없다 — 홀짝을 먼저 갈라야 어느 걸음인지 정해지고
    // 문이 그 갈래 안으로 들어간다. 그래서 진입 검사를 직접 둔다 (C8).
    if (rc.cancelled) return;
    if (count % 2 === 1) {
      product *= cell;
      multiplies += 1;
      bits.push(1);
      if (!(await gate())) return;
      await rc.emit({ type: 'take', payload: { place, count, factor: cell, product } });
    } else {
      bits.push(0);
      if (!(await gate())) return;
      await rc.emit({ type: 'skip', payload: { place, count } });
    }

    count = Math.floor(count / 2);
    if (count === 0) break;

    cell = cell * cell;
    place *= 2;
    squarings += 1;
    row += 1;
    if (!(await gate())) return;
    await rc.emit({ type: 'fold', payload: { row, count, value: cell } });
  }

  if (!(await gate())) return;
  await rc.emit({
    type: 'done',
    payload: {
      product,
      squarings,
      multiplies,
      total: squarings + multiplies,
      naive,
      bits: [...bits].reverse(),
    },
  });
}

export async function squareAndHalve(ctx: FacetContext<SquareAndHalveData>): Promise<void> {
  const rc = ctx as ReactiveContext<SquareAndHalveData>;
  const stepMs = Number.isFinite(rc.data.stepMs) ? rc.data.stepMs : 800;

  // 마운트하면 스스로 한 바퀴 돈다. 누르지 않아도 화면은 할 말을 마친다.
  await playOnce(rc, makeGate(rc, stepMs, false));

  // 그 뒤로는 처음부터 한 걸음씩. 곱씹으며 읽고 싶은 사람을 위한 것이다.
  for (;;) {
    if (!(await nextAdvance(rc))) return;
    await rc.emit({ type: 'rewind', payload: {} });
    await playOnce(rc, makeGate(rc, stepMs, true));
  }
}
