/**
 * crowd-the-tails — 분위수를 재는 그릇이 자리를 나누는 법.
 *
 * 정렬된 점을 여섯 뭉치로 나눈다. 경계는 손으로 적지 않고 압축 계수 δ 의 척도
 * 함수에서 셈한다 — k 를 한 칸씩 끊어 q 로 되돌린 자리가 경계다. 그 함수가 하는
 * 일은 하나다: q 가 0 이나 1 에 가까울수록 한 칸이 덮는 q 폭이 좁아진다.
 *
 * ── 식별자
 *
 * 쓰지 않는다. 이 조각이 말하는 것은 낱낱의 점이 아니라 **경계와 뭉치의 크기**이고,
 * 그 둘은 전부 δ 와 점의 수에서 나오므로 발신이 실어 올 것이 없다 (target 없음).
 *
 * ── 이벤트 (전부 이 facet 고유. silent 인 것은 없다)
 *
 * **payload 가 비어 있다.** 경계·뭉치의 크기·자국의 자리·꼬리와 가운데의 비는
 * 전부 `initialData` 의 δ 와 점의 수에서 셈해지므로, 그것을 걸음이 함께 실어 오면
 * 같은 수의 출처가 둘이 된다 — 타입도 통과하고 화면도 맞아 보이지만 언젠가 갈린다.
 * 자르는 잣대의 정본은 아래 `scaledBoundsOf` 하나이고 `scene.ts` 가 그것을 쓴다.
 *
 *   cut-evenly     {}  q 를 고르게 자른다. 뭉치마다 같은 수가 든다 — 문제.
 *   cut-by-scale   {}  k 를 한 칸씩 끊어 되돌린 자리로 자른다 — 장치.
 *   fill-pair      {}  마주 보는 두 뭉치에 점을 담는다. 가운데 짝부터 꼬리 짝으로
 *                      나아가므로 **몇 번째 짝인지는 이 발신의 차례**가 말한다.
 *   digest-formed  {}  뭉치마다 자국 하나로 접는다 — 결과.
 *   rewind         {}  처음으로 되감는다. 자동 재생을 마친 뒤 처음 advance 를 받을 때.
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CrowdTheTailsData = {
  type: 'crowd-the-tails';
  /** 정렬된 점의 수. */
  count: number;
  /** 압축 계수 δ. k 의 폭이 −δ/4 … +δ/4 이므로 뭉치 수는 δ/2 다. */
  delta: number;
  /** 걸음 사이의 정지 시간 (ms). 읽을 시간을 주는 저작 결정 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 850;

/** k(q) = (δ / 2π) · asin(2q − 1) — 분위를 자의 눈금으로 옮긴다. */
function scaleAt(q: number, delta: number): number {
  return (delta / (2 * Math.PI)) * Math.asin(2 * q - 1);
}

/** q(k) = (sin(2πk / δ) + 1) / 2 — 눈금을 분위로 되돌린다. */
function quantileAtScale(k: number, delta: number): number {
  return (Math.sin((2 * Math.PI * k) / delta) + 1) / 2;
}

/**
 * 눈금을 1 씩 끊어 되돌린 경계 — **자르는 잣대의 정본.**
 *
 * 양 끝 눈금은 q = 0 과 q = 1 에 정확히 닿으므로 겹치지 않게 0 과 1 을 직접 둔다.
 *
 * 걸음의 수(짝이 몇인가)와 화면의 그릇 수가 여기 하나에서 나온다. 부동소수 척도
 * 함수라 두 군데에서 각자 자르면 끝자리가 갈릴 수 있으므로 `scene.ts` 가 이 함수를
 * 그대로 불러 쓴다 — 방향은 Scene → Algorithm 이라 맞다 (원칙 1).
 */
export function scaledBoundsOf(delta: number): number[] {
  if (!Number.isFinite(delta) || delta <= 0) return [0, 1];
  const kMin = scaleAt(0, delta);
  const kMax = scaleAt(1, delta);
  const out: number[] = [0];
  for (let k = Math.ceil(kMin + 1e-9); k <= Math.floor(kMax - 1e-9); k += 1) {
    const q = quantileAtScale(k, delta);
    if (q > 0 && q < 1) out.push(q);
  }
  out.push(1);
  return out;
}

/**
 * 담아 나가는 짝의 차례 — 가운데 짝이 먼저이고 꼬리 짝이 마지막이다.
 *
 * 걸음의 수(`length`)와 그 걸음이 어느 두 뭉치를 담는가(`[j]`)가 한 함수에서
 * 나온다. 발신이 뭉치 번호를 싣지 않는 까닭이 이것이다 — 차례가 곧 짝이다.
 */
export function pairsOf(parts: number): Array<{ left: number; right: number }> {
  const out: Array<{ left: number; right: number }> = [];
  for (let left = Math.floor((parts - 1) / 2); left >= 0; left -= 1) {
    out.push({ left, right: parts - 1 - left });
  }
  return out;
}

export async function crowdTheTailsAlgorithm(
  base: FacetContext<CrowdTheTailsData>,
): Promise<void> {
  const ctx = base as ReactiveContext<CrowdTheTailsData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  // 뭉치 수는 척도 함수가 정한다. 화면도 같은 함수로 세므로 갈릴 수 없다.
  const parts = scaledBoundsOf(ctx.data.delta).length - 1;
  const pairs = pairsOf(parts);

  /** 자동 재생을 마친 뒤로는 손으로 짚는다. */
  let manual = false;
  /** 되감은 직후의 첫 문은 그냥 지난다 — 첫 걸음 앞에는 기다릴 앞걸음이 없다. */
  let openFirstGate = true;

  /** advance 만 걸음으로 센다. 다른 입력은 흘려보낸다 (S-piece). */
  async function waitForAdvance(): Promise<boolean> {
    for (;;) {
      if ((await ctx.waitForInput()).type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 걸음 사이의 문. */
  async function gate(): Promise<boolean> {
    if (openFirstGate) {
      openFirstGate = false;
      return !ctx.cancelled;
    }
    if (!manual) return ctx.sleep(stepMs);
    return waitForAdvance();
  }

  for (;;) {
    // 문제 — 고르게 자르면 뭉치마다 같은 수가 든다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'cut-evenly', payload: {} });

    // 장치 — 자를 눕히면 자리가 꼬리로 몰린다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'cut-by-scale', payload: {} });

    // 결과 — 가운데 짝에서 꼬리 짝으로 담아 나간다. 짝은 뭉치 수가 정한다.
    for (let j = 0; j < pairs.length; j += 1) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'fill-pair', payload: {} });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'digest-formed', payload: {} });

    // 할 말을 마쳤다. 다음 advance 는 되감고 첫 걸음까지 간다 (S-piece).
    if (!(await waitForAdvance())) return;
    manual = true;
    openFirstGate = true;
    await ctx.emit({ type: 'rewind' });
  }
}
