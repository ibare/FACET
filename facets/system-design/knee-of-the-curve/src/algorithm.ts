/**
 * knee-of-the-curve — 도착률을 한 칸씩 올리며 M/M/1 정상 상태의 평균 머묾을 본다.
 *
 * 모형: 포아송 도착(λ 건/초) · 지수 분포 처리(처리율 μ 건/초) · 서버 하나 · 줄 무한.
 * 평균 머묾 W = 1000 / (μ − λ) ms. 이용률 = λ / μ. 기다림(줄에서) = W − 1000 / μ ms.
 * 시뮬레이션을 돌리지 않는다 — 식에서 셈한 정상 상태의 평균이다. λ ≥ μ 면 던진다.
 *
 * 이벤트
 *   init  (silent) — 걸음 0 의 바탕을 싣는다
 *     payload: { serviceMs: number; wMaxMs: number }
 *       serviceMs  평균 처리 시간 1000 / μ (ms)
 *       wMaxMs     데이터의 도착률 가운데 가장 큰 W (ms) — 세로 축의 끝
 *   load  — 도착률 한 칸
 *     payload: {
 *       lambda: number;         도착률 (건/초)
 *       utilization: number;    λ / μ
 *       spare: number;          여유 μ − λ (건/초)
 *       wMs: number;            평균 머묾 (ms)
 *       waitMs: number;         줄에서 기다린 평균 (ms)
 *       deltaMs: number | null; 앞 걸음 W 에서 늘어난 몫 (첫 칸은 null)
 *       ratioToFirst: number;   첫 칸 W 에 견준 배수
 *       last: boolean;          마지막 칸인가
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KneeOfTheCurveFacetData = {
  type: 'knee-of-the-curve';
  stepMs: number;
  /** 처리율 μ (건/초) */
  mu: number;
  /** 한 걸음마다 올리는 도착률 λ (건/초) */
  lambdas: number[];
};

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** 자료의 모양을 보고 어긋나면 던진다. 알고리즘과 장면이 같이 부른다. */
export function narrowKneeData(raw: unknown): KneeOfTheCurveFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('knee-of-the-curve: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'knee-of-the-curve') {
    throw new Error(`knee-of-the-curve: type 이 knee-of-the-curve 가 아니다 (${String(r.type)})`);
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) {
    throw new Error('knee-of-the-curve: stepMs 는 양수여야 한다');
  }
  // 처리율의 칸 수가 화면의 칸 수라 정수로 받는다
  if (!isPositiveInteger(r.mu)) {
    throw new Error('knee-of-the-curve: mu 는 양의 정수여야 한다');
  }
  const mu = r.mu;
  if (!Array.isArray(r.lambdas) || r.lambdas.length === 0) {
    throw new Error('knee-of-the-curve: lambdas 는 비지 않은 배열이어야 한다');
  }
  const lambdas: number[] = [];
  r.lambdas.forEach((v: unknown, i: number) => {
    if (!isPositiveInteger(v)) {
      throw new Error(`knee-of-the-curve: lambdas[${i}] 는 양의 정수여야 한다`);
    }
    if (v >= mu) {
      throw new Error(`knee-of-the-curve: lambdas[${i}] = ${v} 가 처리율 ${mu} 이상이다 — 정상 상태가 없다`);
    }
    const before = lambdas[lambdas.length - 1];
    if (before !== undefined && v <= before) {
      throw new Error(`knee-of-the-curve: lambdas[${i}] 가 앞 값보다 크지 않다`);
    }
    lambdas.push(v);
  });
  return { type: 'knee-of-the-curve', stepMs: r.stepMs, mu, lambdas };
}

/** M/M/1 정상 상태의 평균 머묾 (ms). λ ≥ μ 면 던진다. */
export function timeInSystemMs(mu: number, lambda: number): number {
  if (!(lambda < mu)) {
    throw new Error(`knee-of-the-curve: λ ${lambda} ≥ μ ${mu} — 줄이 끝없이 자라 평균이 없다`);
  }
  return 1000 / (mu - lambda);
}

export async function kneeOfTheCurve(
  baseCtx: FacetContext<KneeOfTheCurveFacetData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<KneeOfTheCurveFacetData>;
  const data = narrowKneeData(ctx.data);
  const { mu, lambdas, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const serviceMs = 1000 / mu;
  const wMaxMs = Math.max(...lambdas.map((lambda) => timeInSystemMs(mu, lambda)));
  await ctx.emit({ type: 'init', payload: { serviceMs, wMaxMs }, silent: true });

  let firstW: number | null = null;
  let prevW: number | null = null;
  for (const [i, lambda] of lambdas.entries()) {
    // 걸음 0 (서버와 처리율) 을 읽을 틈을 두고 나서 첫 칸을 올린다
    if (!(await pause())) return;
    const wMs = timeInSystemMs(mu, lambda);
    if (firstW === null) firstW = wMs;
    await ctx.emit({
      type: 'load',
      payload: {
        lambda,
        utilization: lambda / mu,
        spare: mu - lambda,
        wMs,
        waitMs: wMs - serviceMs,
        deltaMs: prevW === null ? null : wMs - prevW,
        ratioToFirst: wMs / firstW,
        last: i === lambdas.length - 1,
      },
    });
    prevW = wMs;
  }
}
