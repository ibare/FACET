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
 * ── 이벤트 (silent 은 없다. 다섯 다 화면이 바뀌는 걸음 경계다)
 *
 *   begin   { n, quad, lin, cons, sum, share, topIndex }
 *           사다리의 첫 단. 빈 막대가 세 몫으로 차오른다.
 *   rung    { n, quad, lin, cons, sum, share, topIndex }
 *           사다리의 다음 단. 경계가 미끄러진다.
 *   tie     { n, quad, lin, cons, sum, share, topIndex }
 *           세 항이 정확히 같아지는 단. 이 조각의 갈림목이다.
 *   settle  {}
 *           작은 항 둘을 지우고 최고차항만 남긴다.
 *   rewind  {}
 *           한 걸음씩 다시 볼 때 처음으로 되감는다.
 *
 *   payload 의 share 는 최고차항의 몫(0~1)이고, topIndex 는 가장 큰 항의
 *   자리다 (0 = 최고차항 · 1 = 일차항 · 2 = 상수항). 화면 문안은 싣지 않는다 —
 *   문안을 정하는 것은 표현 계층의 일이다 (C10).
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

/**
 * 사다리 한 단을 셈한다. 순수 함수라 테스트가 같은 것을 그 자리에서 다시 셈해
 * 대조할 수 있다 — 근거의 정본은 스크래치가 아니라 커밋된 검사다.
 */
export function computeRung(data: GrowthOutpacesData, n: number): GrowthRung {
  const quad = data.quadratic * n * n;
  const lin = data.linear * n;
  const cons = data.constant;
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
  const ladder = Array.isArray(data.ladder) ? data.ladder : [];
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

      const r = computeRung(data, ladder[i]!);
      const payload = {
        n: r.n,
        quad: r.quad,
        lin: r.lin,
        cons: r.cons,
        sum: r.sum,
        share: r.share,
        topIndex: r.topIndex,
      };

      // type 은 리터럴로 쓴다 (C2). 세 갈래가 화면에서 서로 다른 말을 한다.
      if (i === 0) {
        await ctx.emit({ type: 'begin', payload });
      } else if (r.tie) {
        await ctx.emit({ type: 'tie', payload });
      } else {
        await ctx.emit({ type: 'rung', payload });
      }

      if (!manual && !(await pause())) return;
    }

    if (ctx.cancelled) return;
    if (manual && !(await gate())) return;
    await ctx.emit({ type: 'settle', payload: {} });
    if (!manual && !(await pause())) return;

    // 한 바퀴가 끝났다. 여기서부터는 누를 때마다 한 걸음씩 간다.
    if (!(await gate())) return;
    manual = true;
    await ctx.emit({ type: 'rewind', payload: {} });
  }
}
