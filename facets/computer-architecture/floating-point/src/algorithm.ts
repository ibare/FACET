/**
 * 부동소수점 — 한정된 자릿수를 지수에 줄지 가수에 줄지.
 *
 * 전체 8비트에서 부호 1비트를 뺀 7비트를 지수와 가수가 나눠 갖는다. 지수에 많이
 * 주면 담는 범위가 넓어지는 대신 눈금이 성겨지고, 가수에 많이 주면 눈금이
 * 촘촘해지는 대신 범위가 좁아진다. 두 수가 반대 방향으로 단조롭게 움직이는 것이
 * 이 화면의 주장이다 — 공짜가 없다.
 *
 * ── 메커니즘이 reactive 인 까닭
 *
 * 사양은 `mechanismKind` 를 선언하지 말라(=coroutine)고 했으나 그대로는 **마운트
 * 시점에 던진다.** `CoroutineMechanism.supportedControls` 는
 * `['play','pause','step','reset','speed']` 뿐이고 `'*'` 와일드카드가 없어,
 * 러너의 `assertControlsSupported` 가 `action: 'expBits'` 를 미지원으로 보고
 * `runFacet` 을 세운다. 손잡이가 논증을 지는 이 화면에서 손잡이를 뺄 수는 없으므로
 * `'*'` 를 가진 reactive 로 간다 — segmented-slider 를 단 완제품 열둘이 모두 같다.
 *
 * ── 이벤트 어휘 (C2)
 *
 *   split    { totalBits, signBits, expBits, manBits, bias }
 *              비트 배분이 정해졌다. silent 아님.
 *   measure  { name, value }   읽을 수 하나가 나왔다. silent 아님.
 *              name ∈ 'bias' | 'max-value' | 'min-normal' | 'gap' | 'tick-count'
 *   ruler    { ticks, gap }    1 과 2 사이 눈금자를 놓는다. silent 아님.
 *   store    { input, stored } 실수 하나를 이 형식에 담아 본 결과. silent 아님.
 *   phase    { phase }         코드 패널 하이라이트 동기화. silent: true.
 *
 *   화면 문안은 하나도 싣지 않는다 — 수만 보낸다. 무엇이라 쓸지는 표현 계층의
 *   일이다 (C10).
 *
 * ── phase 어휘 (C3)
 *
 *   'bias' | 'range' | 'min-normal' | 'gap' | 'ticks' | 'store'
 *   `irs.ts` 의 phase 집합과 정확히 같다.
 *
 * ── 메트릭 (C5)
 *
 *   'max-value'   담는 최대값        — e 가 커지면 커진다 (3.9375 → 57,344)
 *   'tick-count'  1 과 2 사이 눈금 수 — e 가 커지면 작아진다 (32 → 4)
 *   둘이 반대로 움직이는 것이 맞바꿈 그 자체다.
 *
 * ── 입력 어휘 (reactive)
 *
 *   { type: 'expBits', payload: { value: number } }  지수에 줄 비트 수를 바꾼다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FloatingPointData = {
  type: string;
  /** 전체 비트 수. */
  totalBits: number;
  /** 부호 비트 수 (고정). */
  signBits: number;
  /** 지수에 줄 수 있는 비트 수의 사다리. */
  expBitsLadder: number[];
  /** 지금 지수가 가진 비트 수. */
  expBits: number;
};

/** 비트 배분 하나에서 따라 나오는 것들. 전부 그 자리에서 셈한다. */
export type FloatingPointFormat = {
  manBits: number;
  bias: number;
  /** 무한대·NaN 자리를 뺀 가장 큰 실제 지수. */
  topExp: number;
  maxValue: number;
  minNormal: number;
  /** 1.0 바로 옆 수까지의 간격 = 2^(-manBits). */
  gap: number;
  /** 1 과 2 사이에 놓이는 값의 개수 = 2^manBits. */
  tickCount: number;
};

/** 걸음 사이의 간격. */
const STEP_MS = 420;

/**
 * 담아 볼 실수.
 *
 * `initialData` 가 아니라 여기 둔다 — 사양이 1차 데이터를 비트 배분 넷으로
 * 한정했고, 이 값은 **형식이 아니라 형식을 시험하는 시료**다. 2진법으로 딱
 * 떨어지지 않아 네 배분 어디서도 그대로 담기지 않는다.
 */
const PROBE = 3.14159;

/**
 * IEEE 754 를 8비트로 줄인 셈법.
 *
 * - 치우침 = 2^(e−1) − 1
 * - 지수 비트가 전부 1 인 것은 무한대·NaN 자리로 빼 두므로
 *   가장 큰 실제 지수 = (2^e − 2) − 치우침
 * - 담는 최대값 = (2 − 2^(−m)) × 2^(가장 큰 지수)
 * - 가장 작은 정규값 = 2^(1 − 치우침)
 */
export function computeFloatingPointFormat(
  totalBits: number,
  signBits: number,
  expBits: number,
): FloatingPointFormat {
  const manBits = totalBits - signBits - expBits;
  const bias = 2 ** (expBits - 1) - 1;
  const topExp = 2 ** expBits - 2 - bias;
  const gap = 2 ** -manBits;
  return {
    manBits,
    bias,
    topExp,
    maxValue: (2 - gap) * 2 ** topExp,
    minNormal: 2 ** (1 - bias),
    gap,
    tickCount: 2 ** manBits,
  };
}

/**
 * x 를 이 형식에 담았을 때 실제로 저장되는 값 (가장 가까운 표현 가능값).
 *
 * x > 0 을 전제한다. 비정규값은 이 화면의 주장 밖이라 최소 정규값 아래는 0 으로
 * 본다. 순수 계산 헬퍼이므로 ctx 를 받지 않는다 (C8 Exception).
 */
export function storeInFormat(
  x: number,
  totalBits: number,
  signBits: number,
  expBits: number,
): number {
  const f = computeFloatingPointFormat(totalBits, signBits, expBits);
  if (x > f.maxValue) return f.maxValue;
  if (x < f.minNormal) return 0;

  // x 가 놓이는 이진 구간 [2^E, 2^(E+1)) 을 찾는다.
  let lo = f.minNormal;
  let curExp = 1 - f.bias;
  while (curExp < f.topExp) {
    if (x < lo * 2) break;
    lo *= 2;
    curExp += 1;
  }

  const step = lo * f.gap;
  const stored = Math.floor(x / step + 0.5) * step;
  return stored > f.maxValue ? f.maxValue : stored;
}

export async function floatingPointAlgorithm(
  raw: FacetContext<FloatingPointData>,
): Promise<void> {
  const ctx = raw as ReactiveContext<FloatingPointData>;

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * 메트릭은 더해지므로 (`ctx.metric` 이 delta 를 누적한다) 지금 보인 값과의
   * 차이만 보낸다. 이름은 호출부에 리터럴로 남아 grep 에 잡힌다 (C5).
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  const readExpBits = (payload: unknown): number | null => {
    if (typeof payload !== 'object' || payload === null) return null;
    const p = payload as { value?: unknown };
    return typeof p.value === 'number' ? p.value : null;
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 취소·되감김이면 false (C8). */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return ctx.sleep(STEP_MS);
  };

  /** 지금 배분 하나를 처음부터 끝까지 보인다. */
  const show = async (): Promise<boolean> => {
    const d = ctx.data;
    const f = computeFloatingPointFormat(d.totalBits, d.signBits, d.expBits);

    await ctx.emit({
      type: 'split',
      payload: {
        totalBits: d.totalBits,
        signBits: d.signBits,
        expBits: d.expBits,
        manBits: f.manBits,
        bias: f.bias,
      },
    });
    if (!(await gate())) return false;

    await phase('bias');
    await ctx.emit({ type: 'measure', payload: { name: 'bias', value: f.bias } });
    if (!(await gate())) return false;

    await phase('range');
    await ctx.emit({ type: 'measure', payload: { name: 'max-value', value: f.maxValue } });
    setMetric('max-value', f.maxValue);
    if (!(await gate())) return false;

    await phase('min-normal');
    await ctx.emit({ type: 'measure', payload: { name: 'min-normal', value: f.minNormal } });
    if (!(await gate())) return false;

    await phase('gap');
    await ctx.emit({ type: 'measure', payload: { name: 'gap', value: f.gap } });
    if (!(await gate())) return false;

    await phase('ticks');
    await ctx.emit({ type: 'measure', payload: { name: 'tick-count', value: f.tickCount } });
    setMetric('tick-count', f.tickCount);
    await ctx.emit({ type: 'ruler', payload: { ticks: f.tickCount, gap: f.gap } });
    if (!(await gate())) return false;

    await phase('store');
    await ctx.emit({
      type: 'store',
      payload: {
        input: PROBE,
        stored: storeInFormat(PROBE, d.totalBits, d.signBits, d.expBits),
      },
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await show())) return;
      // 다 보였으면 손잡이를 기다린다. 앞뒤로 취소를 본다 (C8).
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'expBits') continue;
      const next = readExpBits(input.payload);
      if (next === null) continue;
      ctx.data.expBits = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
