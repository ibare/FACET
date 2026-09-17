/**
 * growth-outpaces — 최고차항 지배 (조각)
 *
 * `f(n) = a·n² + b·n + c` 한 식을 항 셋으로 쪼개, 셋이 한 막대를 나눠 갖다가
 * n 이 커지면 최고차항 하나가 나머지를 벽으로 밀어붙이는 것을 보인다.
 *
 * **1차 데이터는 계수 셋과 n 사다리뿐이다.** 항의 값 · 합 · 최고차항의 몫 ·
 * 가장 큰 항이 무엇인지 · 세 항이 정확히 같아지는 자리는 전부 여기서 셈한다.
 * 선언에 옮겨 적으면 저작자의 오타가 그대로 화면에 뜬다.
 *
 * ── 셈은 함수로 내주고, 발신은 차례와 판정만 말한다
 *
 * 계수 셋과 n 하나가 정해지면 **그 단의 모든 수가 결정된다.** 걸음이 내리는
 * 판정이 하나도 없다는 뜻이라, 항의 값을 payload 로 실어 보내지 않고 셈하는
 * 함수를 내주어 장면이 부르게 한다 (`computeRung` · `ladderOf`, 프로토콜 4 절의
 * B 갈래). 실어 보내면 출처가 갈리지는 않아도 **다음 사람이 집어 쓸 문**이 열린
 * 채로 남는다 — 그 문이 "두 자리에서 세기" 가 들어오는 길이다.
 *
 * 몇 번째 단인가도 싣지 않는다. 단은 올 때마다 하나씩 쌓이므로 발신이 온 차례가
 * 곧 사다리의 자리이고, 그 자리의 n 은 `ladderOf` 가 좁힌 사다리가 말한다 —
 * 이 파일과 장면이 같은 함수를 부르므로 걸음 수와 화면의 n 이 갈릴 수 없다.
 *
 * 남는 것은 **판정 하나**다. 이 단이 갈림목인가 · 첫 단인가는 발신의 type 이
 * 말한다. payload 가 아니라 어휘로 싣는다.
 *
 * ── 이벤트 (silent 은 없다. 다섯 다 화면이 바뀌는 걸음 경계다)
 *
 *   begin   payload 없음
 *           사다리의 첫 단. 빈 막대가 세 몫으로 차오른다.
 *   rung    payload 없음
 *           사다리의 다음 단. 경계가 미끄러진다.
 *   tie     payload 없음
 *           세 항이 정확히 같아지는 단. 이 조각의 갈림목이다.
 *   settle  payload 없음
 *           작은 항 둘을 지우고 최고차항만 남긴다.
 *   rewind  payload 없음
 *           한 걸음씩 다시 볼 때 처음으로 되감는다.
 *
 *   화면 문안은 싣지 않는다 — 문안을 정하는 것은 표현 계층의 일이다 (C10).
 *
 * 메트릭은 부르지 않는다 (조각 — S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type GrowthOutpacesData = {
  type: 'growth-outpaces';
  /** 최고차항(n²) 의 계수. */
  quadratic: number;
  /** 일차항(n) 의 계수. */
  linear: number;
  /** 상수항. */
  constant: number;
  /** 입력 크기 사다리. 오름차순. */
  ladder: number[];
  /** 걸음 사이의 정지 시간 (S-piece — 읽을 시간은 저작 결정이다). */
  stepMs: number;
};

/** 한 단에서 셈해 낸 것. 화면에 뜨는 수는 전부 여기서 나온다. */
export type GrowthRung = {
  n: number;
  /** 최고차항의 값. */
  quad: number;
  /** 일차항의 값. */
  lin: number;
  /** 상수항의 값. */
  cons: number;
  sum: number;
  /** 최고차항의 몫 (0~1). */
  share: number;
  /** 가장 큰 항의 자리 (0 최고차 · 1 일차 · 2 상수). */
  topIndex: number;
  /** 세 항이 정확히 같은 단인가. */
  tie: boolean;
};

/** 셈에 드는 것은 계수 셋뿐이다. 사다리도 박자도 이 셈에 들어가지 않는다. */
export type GrowthCoeffs = Pick<GrowthOutpacesData, 'quadratic' | 'linear' | 'constant'>;

/**
 * 걸어갈 사다리를 좁힌다 — **자르는 잣대의 정본.**
 *
 * 단의 개수가 곧 걸음 수이고, 몇 번째 걸음이 어느 n 인가도 이 목록이 정한다.
 * 이 파일과 장면이 같은 함수를 부르므로 걸음 수와 화면의 n 이 갈릴 수 없다.
 */
export function ladderOf(ladder: unknown): number[] {
  if (!Array.isArray(ladder)) return [];
  return (ladder as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

/**
 * 사다리 한 단을 셈한다. 순수 함수라 테스트가 같은 것을 그 자리에서 다시 셈해
 * 대조할 수 있다 — 근거의 정본은 스크래치가 아니라 커밋된 검사다.
 *
 * **장면도 이 함수를 부른다.** 화면에 뜨는 항의 값 · 합 · 몫이 걸음이 실어 온
 * 수와 갈리지 않도록 셈을 두 벌로 두지 않고 여기 하나만 둔다 (프로토콜 4 절의
 * B 갈래). 이 함수만 떼어 내도 조각이 말하려는 바 — 사다리를 올라가며 몫이
 * 한쪽으로 쏠린다 — 는 남는다. 그래서 싣지 않고 내준다.
 */
export function computeRung(coeffs: GrowthCoeffs, n: number): GrowthRung {
  const quad = coeffs.quadratic * n * n;
  const lin = coeffs.linear * n;
  const cons = coeffs.constant;
  const sum = quad + lin + cons;
  const terms = [quad, lin, cons];

  let topIndex = 0;
  for (let i = 1; i < terms.length; i += 1) {
    if (terms[i]! > terms[topIndex]!) topIndex = i;
  }

  return {
    n,
    quad,
    lin,
    cons,
    sum,
    share: sum > 0 ? quad / sum : 0,
    topIndex,
    tie: quad === lin && lin === cons,
  };
}

export async function growthOutpaces(ctx: FacetContext<GrowthOutpacesData>): Promise<void> {
  const rctx = ctx as ReactiveContext<GrowthOutpacesData>;
  const data = ctx.data;
  // 자르는 잣대는 하나다 — 장면도 같은 함수로 사다리를 좁힌다.
  const ladder = ladderOf(data.ladder);
  if (ladder.length === 0) return;

  /** 걸음 사이의 정지. 취소되면 false. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return rctx.sleep(data.stepMs);
  };

  /** `advance` 가 올 때까지 기다린다. 취소되면 false. */
  const gate = async (): Promise<boolean> => {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await rctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (input.type === 'advance') return true;
    }
  };

  // 자동 재생을 한 바퀴 돈 뒤부터는 손으로 돈다.
  let manual = false;

  for (;;) {
    if (ctx.cancelled) return;

    for (let i = 0; i < ladder.length; i += 1) {
      if (ctx.cancelled) return;
      // 문은 걸음 *사이*의 것이다. 한 바퀴의 첫 걸음 앞에는 기다릴 앞걸음이
      // 없으므로 지나지 않는다 — 되감기 직후의 첫 누름이 첫 걸음까지 가는 것도
      // 이 때문이다 (S-piece).
      if (manual && i > 0) {
        if (!(await gate())) return;
      }

      // 실어 보낼 수가 없다. 이 단의 모든 수는 계수 셋과 n 에서 결정되므로
      // 장면이 같은 `computeRung` 을 부른다. 여기서 셈하는 것은 **판정 하나** —
      // 이 단이 갈림목인가 — 이고, 그것은 발신의 type 이 말한다.
      const tie = computeRung(data, ladder[i]!).tie;

      // type 은 리터럴로 쓴다 (C2). 세 갈래가 화면에서 서로 다른 말을 한다.
      if (i === 0) {
        await ctx.emit({ type: 'begin' });
      } else if (tie) {
        await ctx.emit({ type: 'tie' });
      } else {
        await ctx.emit({ type: 'rung' });
      }

      if (!manual && !(await pause())) return;
    }

    if (ctx.cancelled) return;
    if (manual && !(await gate())) return;
    await ctx.emit({ type: 'settle' });
    if (!manual && !(await pause())) return;

    // 한 바퀴가 끝났다. 여기서부터는 누를 때마다 한 걸음씩 간다.
    if (!(await gate())) return;
    manual = true;
    await ctx.emit({ type: 'rewind' });
  }
}
