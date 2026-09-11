/**
 * crowd-the-tails — 분위수를 재는 그릇이 자리를 나누는 법.
 *
 * 정렬된 점을 여섯 뭉치로 나눈다. 경계는 손으로 적지 않고 압축 계수 δ 의 척도
 * 함수에서 셈한다 — k 를 한 칸씩 끊어 q 로 되돌린 자리가 경계다. 그 함수가 하는
 * 일은 하나다: q 가 0 이나 1 에 가까울수록 한 칸이 덮는 q 폭이 좁아진다.
 *
 * ── 식별자
 *
 * 쓰지 않는다. 이 조각이 말하는 것은 낱낱의 점이 아니라 **경계와 뭉치의 크기**라
 * payload 로만 오간다 (target 없음).
 *
 * ── 이벤트 (전부 이 facet 고유. silent 인 것은 없다)
 *
 *   cut-evenly     { bounds: number[]; counts: number[] }
 *                  q 를 고르게 자른 경계(0…1, 오름차순)와 그때 각 뭉치에 드는 점의 수.
 *   cut-by-scale   { bounds: number[]; counts: number[] }
 *                  k 를 한 칸씩 끊어 되돌린 경계와 그때의 점의 수.
 *   fill-pair      { left: number; right: number; leftCount: number; rightCount: number }
 *                  마주 보는 두 뭉치에 점을 담는다. left/right 는 뭉치 번호.
 *                  가운데 짝부터 꼬리 짝으로 나아간다.
 *   digest-formed  { qs: number[]; counts: number[];
 *                    tailCount: number; middleCount: number; ratio: number }
 *                  뭉치마다 자국 하나. qs 는 그 뭉치에 든 점들의 분위 평균이고
 *                  ratio 는 가장 굵은 뭉치 ÷ 가장 얇은 뭉치다.
 *   rewind         {}
 *                  처음으로 되감는다. 자동 재생을 마친 뒤 처음 advance 를 받을 때.
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

/** i 번째 점이 서 있는 분위. 표본의 한가운데를 잡는 흔한 규약이다. */
function quantileAt(i: number, n: number): number {
  return (i + 0.5) / n;
}

/** k(q) = (δ / 2π) · asin(2q − 1) — 분위를 자의 눈금으로 옮긴다. */
function scaleAt(q: number, delta: number): number {
  return (delta / (2 * Math.PI)) * Math.asin(2 * q - 1);
}

/** q(k) = (sin(2πk / δ) + 1) / 2 — 눈금을 분위로 되돌린다. */
function quantileAtScale(k: number, delta: number): number {
  return (Math.sin((2 * Math.PI * k) / delta) + 1) / 2;
}

/**
 * 눈금을 1 씩 끊어 되돌린 경계.
 *
 * 양 끝 눈금은 q = 0 과 q = 1 에 정확히 닿으므로 겹치지 않게 0 과 1 을 직접 둔다.
 */
function scaledBounds(delta: number): number[] {
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

/** 같은 수의 뭉치로 q 를 고르게 자른 경계. 견줄 상대다. */
function evenBounds(parts: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= parts; i += 1) out.push(i / parts);
  return out;
}

/** 분위 q 가 드는 뭉치 번호. 경계는 왼쪽을 품고 오른쪽을 넘긴다. */
function bucketOf(q: number, bounds: number[]): number {
  let b = 0;
  while (b < bounds.length - 2 && q >= bounds[b + 1]) b += 1;
  return b;
}

/** 뭉치마다 몇 점이 드는가. */
function countsIn(bounds: number[], n: number): number[] {
  const out = new Array<number>(bounds.length - 1).fill(0);
  for (let i = 0; i < n; i += 1) out[bucketOf(quantileAt(i, n), bounds)] += 1;
  return out;
}

/** 뭉치가 남기는 자국의 자리 — 그 뭉치에 든 점들의 분위 평균. */
function centroidsIn(bounds: number[], n: number): number[] {
  const sum = new Array<number>(bounds.length - 1).fill(0);
  const hit = new Array<number>(bounds.length - 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const q = quantileAt(i, n);
    const b = bucketOf(q, bounds);
    sum[b] += q;
    hit[b] += 1;
  }
  return sum.map((s, b) => (hit[b] === 0 ? (bounds[b] + bounds[b + 1]) / 2 : s / hit[b]));
}

export async function crowdTheTailsAlgorithm(
  base: FacetContext<CrowdTheTailsData>,
): Promise<void> {
  const ctx = base as ReactiveContext<CrowdTheTailsData>;
  const n = Math.max(1, Math.floor(ctx.data.count));
  const delta = ctx.data.delta;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  const scaled = scaledBounds(delta);
  const parts = scaled.length - 1;
  const even = evenBounds(parts);
  const evenCounts = countsIn(even, n);
  const counts = countsIn(scaled, n);
  const qs = centroidsIn(scaled, n);
  const tailCount = Math.min(...counts);
  const middleCount = Math.max(...counts);
  const ratio = tailCount === 0 ? 0 : middleCount / tailCount;

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
    await ctx.emit({ type: 'cut-evenly', payload: { bounds: even, counts: evenCounts } });

    // 장치 — 자를 눕히면 자리가 꼬리로 몰린다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'cut-by-scale', payload: { bounds: scaled, counts } });

    // 결과 — 가운데 짝에서 꼬리 짝으로 담아 나간다. 짝은 뭉치 수가 정한다.
    for (let left = Math.floor((parts - 1) / 2); left >= 0; left -= 1) {
      const right = parts - 1 - left;
      if (!(await gate())) return;
      await ctx.emit({
        type: 'fill-pair',
        payload: { left, right, leftCount: counts[left], rightCount: counts[right] },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'digest-formed',
      payload: { qs, counts, tailCount, middleCount, ratio },
    });

    // 할 말을 마쳤다. 다음 advance 는 되감고 첫 걸음까지 간다 (S-piece).
    if (!(await waitForAdvance())) return;
    manual = true;
    openFirstGate = true;
    await ctx.emit({ type: 'rewind' });
  }
}
