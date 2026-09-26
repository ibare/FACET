/**
 * rescale-each-batch — 배치 정규화가 한 묶음의 값을 옮기고 늘이고 줄이는 차례.
 *
 * 묶음마다 **그 묶음의 값만으로** 평균 μ 와 모집단 분산 σ² (÷ n) 을 셈하고,
 * 한 묶음에 두 걸음을 둔다 — ① 자리 맞춤 x − μ  ② 폭 맞춤 (x − μ) / √(σ² + ε).
 * 묶음 차례는 자료에 적힌 그대로다. γ = 1 · β = 0 이라 되돌림 걸음은 없다.
 *
 * 이벤트
 *   init   (silent) — 걸음 0 의 바탕. 묶음마다 처음 통계와 화면 축의 범위
 *     payload: {
 *       batches: Array<{ id: string; mean: number; variance: number; std: number }>;
 *       range: { min: number; max: number };   // 모든 걸음의 값과 μ ± σ 를 다 담는 범위
 *     }
 *   center — 한 묶음의 자리 맞춤 (x − μ). 값이 μ 만큼 옮겨지고 폭은 그대로
 *     payload: {
 *       batch: string; mean: number;           // 뺀 평균
 *       values: number[];                      // 옮긴 뒤 값 (묶음 안 차례 그대로)
 *       meanAfter: number; stdBefore: number; stdAfter: number;
 *     }
 *   scale — 한 묶음의 폭 맞춤 (÷ √(σ² + ε))
 *     payload: {
 *       batch: string; divisor: number;        // √(σ² + ε)
 *       values: number[];                      // 나눈 뒤 값
 *       meanAfter: number; stdBefore: number; stdAfter: number;
 *     }
 *
 * 걸음: 걸음 0 (처음 모습) + 묶음마다 center · scale — 묶음 셋이면 일곱.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RescaleBatch = { id: string; values: number[] };

export type RescaleEachBatchFacetData = {
  type: 'rescale-each-batch';
  stepMs: number;
  eps: number;
  batches: RescaleBatch[];
};

/** 자료 좁히개 — algorithm · scene · stage 가 같은 것을 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowRescaleData(raw: unknown): RescaleEachBatchFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('rescale-each-batch: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'rescale-each-batch') throw new Error(`rescale-each-batch: type 이 다르다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('rescale-each-batch: stepMs 가 양수가 아니다');
  if (typeof d.eps !== 'number' || !(d.eps > 0)) throw new Error('rescale-each-batch: eps 가 양수가 아니다');
  if (!Array.isArray(d.batches) || d.batches.length === 0) throw new Error('rescale-each-batch: batches 가 비었다');
  const seen = new Set<string>();
  const batches = d.batches.map((b: unknown, i: number): RescaleBatch => {
    if (typeof b !== 'object' || b === null) throw new Error(`rescale-each-batch: batches[${i}] 가 객체가 아니다`);
    const r = b as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') throw new Error(`rescale-each-batch: batches[${i}].id 가 없다`);
    if (seen.has(r.id)) throw new Error(`rescale-each-batch: batches[${i}].id 가 겹친다 (${r.id})`);
    seen.add(r.id);
    if (!Array.isArray(r.values) || r.values.length < 2) {
      throw new Error(`rescale-each-batch: batches[${i}].values 는 값이 둘 이상이어야 한다`);
    }
    const values = r.values.map((v: unknown, j: number) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`rescale-each-batch: batches[${i}].values[${j}] 가 수가 아니다`);
      }
      return v;
    });
    return { id: r.id, values };
  });
  return { type: 'rescale-each-batch', stepMs: d.stepMs, eps: d.eps, batches };
}

export function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** 모집단 분산 — Σ(x − μ)² / n. 표본 분산(n − 1)이 아니다. */
export function popVariance(xs: readonly number[]): number {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

export async function rescaleEachBatch(
  context: FacetContext<RescaleEachBatchFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<RescaleEachBatchFacetData>;
  const data = narrowRescaleData(ctx.data);
  const { stepMs, eps } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 묶음마다 두 걸음의 값을 먼저 셈한다 — 축 범위가 모든 걸음을 담아야 한다
  const plans = data.batches.map((b) => {
    const mu = mean(b.values);
    const variance = popVariance(b.values);
    const std = Math.sqrt(variance);
    const centered = b.values.map((x) => x - mu);
    const divisor = Math.sqrt(variance + eps);
    const scaled = centered.map((x) => x / divisor);
    return { id: b.id, raw: b.values, mu, variance, std, centered, divisor, scaled };
  });

  let min = Infinity;
  let max = -Infinity;
  for (const p of plans) {
    for (const xs of [p.raw, p.centered, p.scaled]) {
      const m = mean(xs);
      const s = Math.sqrt(popVariance(xs));
      for (const v of [...xs, m - s, m + s]) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      batches: plans.map((p) => ({ id: p.id, mean: p.mu, variance: p.variance, std: p.std })),
      range: { min, max },
    },
  });

  for (const p of plans) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'center',
      payload: {
        batch: p.id,
        mean: p.mu,
        values: p.centered,
        meanAfter: mean(p.centered),
        stdBefore: p.std,
        stdAfter: Math.sqrt(popVariance(p.centered)),
      },
    });
    if (!(await pause())) return;
    await ctx.emit({
      type: 'scale',
      payload: {
        batch: p.id,
        divisor: p.divisor,
        values: p.scaled,
        meanAfter: mean(p.scaled),
        stdBefore: Math.sqrt(popVariance(p.centered)),
        stdAfter: Math.sqrt(popVariance(p.scaled)),
      },
    });
  }
}
