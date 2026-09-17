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
 * 걸음이 실어 오는 것은 **접었을 때 칸의 새 값** 하나뿐이다. 나머지 — 칸 수 ·
 * 자릿값 · 보낸 값 · 누적 곱 · 곱셈 횟수 · 이진 표기 — 는 전부 화면의 자취에서
 * 세지므로 장면이 센다 (`scene.ts`). 화면에 나란히 뜨는 수가 발신과 자취라는 두
 * 출처를 갖지 않게 하는 것이다 (프로토콜 4 절).
 *
 *   begin  {}
 *          줄을 처음 세운다. 칸 수도 칸의 값도 선언이 이미 말한다.
 *   take   {}
 *          칸 수가 홀수라 남는 한 칸을 답으로 보낸다. **판정은 type 자체**이고
 *          어느 칸을 얼마에 보냈는지는 그 줄이 화면에 서 있으므로 장면이 안다.
 *   skip   {}
 *          칸 수가 짝수라 답으로 갈 것이 없다. 이것도 판정은 type 자체다.
 *   fold   { value }
 *          반으로 접는다. value 는 새 칸 하나의 값 — 앞 값의 제곱이다.
 *          **이 하나만 싣는다.** 제곱은 이 알고리즘 그 자체라 함수로 내주면
 *          장면이 알고리즘을 되풀이하게 되고, 더 나쁘게는 이 조각이 *피하려는*
 *          셈(밑을 지수만큼 곱하기)으로도 같은 수가 나와 화면이 "이렇게 안 해도
 *          된다" 고 말하면서 그렇게 얻은 수를 띄우게 된다 (프로토콜 4 절의 경계).
 *   done   {}
 *          다 셌다. 곱셈 횟수도 이진 표기도 자취에서 나온다.
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
 * 지수를 좁힌다 — 칸 수를 정하는 **유일한 잣대**다.
 *
 * 장면도 처음 줄의 칸 수를 알아야 하는데, 양쪽이 각자 `Math.floor` 를 셈하면
 * 선언에 13.5 가 오는 날 줄의 길이와 자리표의 폭이 갈린다. 그래서 여기가 내주고
 * `scene.ts` 가 부른다 (프로토콜 4 절 B 갈래). 자르는 잣대는 이 알고리즘이 아니라
 * 입구의 규칙이라, 떼어 내도 조각이 말하려는 바는 그대로 남는다.
 */
export function exponentOf(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

/**
 * 한 바퀴 재생한다.
 *
 * 걸음표를 손으로 적어 두르지 않는다 — 아래 순회가 곧 그 연산이다 (C2).
 *
 * 세는 일이 여기서 사라졌다. 자릿값 · 누적 곱 · 제곱 횟수 · 답곱 횟수 · 이진
 * 표기를 쥐던 지역 변수 다섯이 발신에서 빠지며 함께 죽었다 — 같은 규칙이 이
 * 파일과 장면 두 곳에 적혀 있던 자리다 (프로토콜 4 절).
 */
async function playOnce(
  rc: ReactiveContext<SquareAndHalveData>,
  gate: Gate,
): Promise<void> {
  /** 남은 칸 수. 곧 남은 지수다. */
  let count = exponentOf(rc.data.exponent);
  /** 칸 하나의 값. 접을 때마다 제 자신을 곱한다. */
  let cell = rc.data.base;

  if (!(await gate())) return;
  await rc.emit({ type: 'begin', payload: {} });

  while (count > 0) {
    // 문(gate)을 바디 첫 줄에 둘 수 없다 — 홀짝을 먼저 갈라야 어느 걸음인지 정해지고
    // 문이 그 갈래 안으로 들어간다. 그래서 진입 검사를 직접 둔다 (C8).
    if (rc.cancelled) return;
    // 홀짝의 판정은 발신의 type 그 자체다. 실어 보낼 것이 따로 없다.
    if (count % 2 === 1) {
      if (!(await gate())) return;
      await rc.emit({ type: 'take', payload: {} });
    } else {
      if (!(await gate())) return;
      await rc.emit({ type: 'skip', payload: {} });
    }

    count = Math.floor(count / 2);
    if (count === 0) break;

    // 두 칸이 만나는 것이 곧 제곱이다. 이 한 줄만 화면으로 건너간다.
    cell = cell * cell;
    if (!(await gate())) return;
    await rc.emit({ type: 'fold', payload: { value: cell } });
  }

  if (!(await gate())) return;
  await rc.emit({ type: 'done', payload: {} });
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
