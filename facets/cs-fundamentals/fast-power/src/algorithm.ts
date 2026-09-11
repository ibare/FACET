/**
 * fastPower — 거듭제곱을 제곱으로 밟아 가며, 그래서 얼마나 아끼는지 센다.
 *
 * 조각(`squareAndHalve`)은 밑 3 · 지수 13 하나로 **접는 방법**을 보이고 멈춘다.
 * 완제품이 더하는 것은 **그래서 얼마나 아끼는가** 다. 손잡이는 지수 하나이고,
 * 그것을 밀면 단순한 쪽(지수 − 1)은 폭발하는데 빠른 쪽은 자릿수를 따라 한 칸씩만
 * 는다. 주 수치는 **절약**(단순 − 빠름)이다 — 빠른 쪽은 13 과 20 에서 둘 다 6 이라
 * 완전 단조가 아니지만 절약은 완전 단조다 (3 → 6 → 13 → 41 → 90 → 984).
 *
 * ── 1차 데이터
 *
 * 밑과 지수 둘뿐이다. 이진 표기도 곱셈 횟수도 절약도 아래 순회가 그 자리에서
 * 셈한다. 미리 적어 두면 지수를 바꿀 때 화면이 조용히 거짓을 말하게 된다.
 *
 * ── 곱셈을 세는 규약
 *
 * 단순한 쪽은 밑에서 시작해 밑을 지수−1 번 곱한다. 빠른 쪽은 답을 1 에서 시작해
 * 첫 곱(1 × 밑)까지 세고, 접을 때마다의 제곱도 곱셈 하나로 센다. 조각이 세운
 * 규약을 그대로 잇는다 — 지수 13 에서 제곱 셋 + 답곱 셋 = 여섯이다.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type      | payload                                                        | silent |
 * |-----------|----------------------------------------------------------------|--------|
 * | `phase`   | `{ phase: string }`                                             | O      |
 * | `begin`   | `{ base, exponent, slow }`                                      | X      |
 * | `take`    | `{ row, place, mults }`                                         | X      |
 * | `skip`    | `{ row, place, mults }`                                         | X      |
 * | `square`  | `{ row, place, mults }`                                         | X      |
 * | `verdict` | `{ exponent, bits, fast, slow, saved, squarings, takes }`        | X      |
 * | `done`    | 없음 (표준 어휘)                                                 | X      |
 *
 * `place` 는 그 제곱이 덮는 지수 폭(1 · 2 · 4 · 8 …)이고, 곧 이진수의 자릿값이다.
 * `bits` 는 큰 자리부터 담은 0/1 배열이다.
 *
 * ── phase 어휘 (C3 — irs.ts 와 집합이 완전히 일치해야 한다)
 *
 * `naive` · `test` · `take` · `square`
 *
 * ── 메트릭 (C5 — facet.ts 의 metrics[].name 과 일치)
 *
 * `fast-mult-count` · `slow-mult-count` · `saved-mult-count` · `square-count`
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FastPowerData = {
  type: 'fast-power';
  /** 밑. 화면은 값 대신 어깨수로 적으므로 지수가 커져도 자리를 넘지 않는다. */
  base: number;
  /** 지수. 손잡이가 바꾼다. */
  exponent: number;
  /**
   * 걸음 하나가 끝난 뒤 쉬는 시간.
   *
   * stage 의 운동이 그 앞에 더해진다 — 가장 얇은 걸음(자리 건너뛰기)이 340ms 라
   * 벽시계는 900ms 이고 실측은 915ms 였다. 읽을 틈을 주는 저작 결정이다 (원칙 2).
   * 800ms 바닥선은 `S-piece` 85–87 이 조각에 못박은 것이나, 이 배치의 사양이
   * 완제품의 자동 재생에도 같은 잣대를 걸어 그대로 준용한다.
   */
  stepMs: number;
};

/** segmented-slider 가 보내는 payload 에서 고른 값을 꺼낸다 (C9). */
function segmentValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const fastPowerAlgorithm = async (ctx: FacetContext<FastPowerData>): Promise<void> => {
  const rctx = ctx as ReactiveContext<FastPowerData>;
  const base = ctx.data.base;
  const step = ctx.data.stepMs;

  let exponent = Math.max(1, Math.floor(ctx.data.exponent));

  /**
   * 메트릭은 늘 **더해진다** (`ctx.metric` 이 누적기다). 그런데 손잡이를 밀 때마다
   * 처음부터 다시 세므로 보이고 싶은 것은 누적이 아니라 이번 판의 값이다. 지금
   * 보이는 값을 기억해 두고 그 차이를 보낸다. 실리는 것은 정수뿐이다.
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판 — 지수 하나를 끝까지 밟고 판정까지. 끝까지 갔으면 true. */
  const playRound = async (): Promise<boolean> => {
    /** 단순한 쪽의 곱셈. 밑에서 시작해 밑을 지수−1 번 곱한다. */
    const slow = Math.max(0, exponent - 1);

    await phase('naive');
    await ctx.emit({ type: 'begin', payload: { base, exponent, slow } });
    setMetric('slow-mult-count', slow);
    setMetric('fast-mult-count', 0);
    setMetric('saved-mult-count', 0);
    setMetric('square-count', 0);
    if (!(await rctx.sleep(step))) return false;

    /** 남은 지수. 반으로 접힐 때마다 줄어든다. */
    let n = exponent;
    /** 지금 손에 든 제곱이 덮는 지수 폭. 이진수의 자릿값이다. */
    let place = 1;
    let row = 0;
    let mults = 0;
    let squarings = 0;
    let takes = 0;
    /** 작은 자리부터 쌓이므로 마지막에 뒤집는다. */
    const bits: number[] = [];

    while (n > 0) {
      // 문(gate)을 바디 첫 줄에 둘 수 없다 — 홀짝을 먼저 갈라야 어느 걸음인지
      // 정해지고 쉬는 자리가 그 갈래 안으로 들어간다. 그래서 진입 검사를 직접
      // 둔다 (C8).
      if (ctx.cancelled) return false;

      if (n % 2 === 1) {
        bits.push(1);
        mults += 1;
        takes += 1;
        await phase('take');
        await ctx.emit({ type: 'take', payload: { row, place, mults } });
        setMetric('fast-mult-count', mults);
        if (!(await rctx.sleep(step))) return false;
      } else {
        bits.push(0);
        await phase('test');
        await ctx.emit({ type: 'skip', payload: { row, place, mults } });
        if (!(await rctx.sleep(step))) return false;
      }

      n = Math.floor(n / 2);
      if (n === 0) break;

      place *= 2;
      row += 1;
      mults += 1;
      squarings += 1;
      await phase('square');
      await ctx.emit({ type: 'square', payload: { row, place, mults } });
      setMetric('fast-mult-count', mults);
      setMetric('square-count', squarings);
      if (!(await rctx.sleep(step))) return false;
    }

    await ctx.emit({
      type: 'verdict',
      payload: {
        exponent,
        bits: [...bits].reverse(),
        fast: mults,
        slow,
        saved: slow - mults,
        squarings,
        takes,
      },
    });
    // 절약은 판정에서야 제 값을 갖는다 — 재생 도중의 `slow - mults` 는 줄어드는
    // 수라 계기에 실으면 거짓을 말한다.
    setMetric('saved-mult-count', slow - mults);
    // 판정이 한 박자 머문 뒤에 "이제 기다린다" 로 넘어간다. 둘을 붙여 내보내면
    // 판정 문장이 같은 프레임에 덮여 아무도 읽지 못한다.
    if (!(await rctx.sleep(step * 3))) return false;
    await ctx.emit({ type: 'done' });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;

      // 손잡이를 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와 위젯만 남는다.
      const ev = await rctx.waitForInput();
      if (ev.type === 'exponent') {
        const v = segmentValue(ev.payload);
        if (v !== null) exponent = Math.max(1, Math.floor(v));
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
