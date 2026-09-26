/**
 * denoise-step-by-step — 역확산 샘플링. 순수 잡음 x_T 에서 출발해 t 하나마다
 * 잡음을 맞히고(예측), 그 일부만 덜어 낸 뒤 작은 새 잡음을 얹어 x_{t−1} 로 내려선다(걷어냄).
 *
 * 규약 (DDPM):
 *   ᾱ_t = Π_{s=1..t} (1 − β_s) · α_t = 1 − β_t
 *   이상적 예측기 — 배운 자료가 samples 뿐일 때
 *     무게 w = softmax( −‖x_t − √ᾱ_t · xᵢ‖² / (2(1 − ᾱ_t)) )   (최댓값을 빼고 셈)
 *     x̂₀ = Σ wᵢ · xᵢ · ε̂ = (x_t − √ᾱ_t · x̂₀) / √(1 − ᾱ_t)
 *   한 걸음: 평균 = (x_t − β_t / √(1 − ᾱ_t) · ε̂) / √α_t · σ_t = √β_t (t = 1 이면 0)
 *            x_{t−1} = 평균 + σ_t · z_t
 *
 * 이벤트 (silent 인 것은 없다. 걸음 0 은 장면의 initial() 이 initialData 의 x_T 로 세운다):
 *
 *   predict   { tIndex: number; epsHat: number[]; x0Hat: number[]; weights: number[] }
 *             t 에서의 예측. weights 는 samples 의 차례를 따른다.
 *   denoise   { tIndex: number; mean: number[]; sigma: number; next: number[]; distances: number[] }
 *             t → t−1 걷어냄. next 가 x_{t−1}. distances 는 next 와 samples 각각의 거리.
 *
 * 차례: (문) predict (문) denoise … t = T → 1. 걸음 0 이 이미 읽을 것(x_T)이 있어 첫 predict 앞에도 문을 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DenoiseSample = { id: string; cells: number[] };

export type DenoiseStepByStepFacetData = {
  type: 'denoise-step-by-step';
  stepMs: number;
  /** 배운 자료 — 식별자와 칸 값 */
  samples: DenoiseSample[];
  /** β_1..β_T */
  betas: number[];
  /** 시작 x_T (뽑힌 순수 잡음) */
  start: number[];
  /** 걸음마다 더하는 새 잡음 z — t = T, T−1, …, 2 의 차례. t = 1 에는 없다 */
  noise: number[][];
};

function isNumArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** 자료를 좁힌다. 모양이 어긋나면 던진다. */
export function readDenoiseData(raw: unknown): DenoiseStepByStepFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('denoise-step-by-step: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'denoise-step-by-step') throw new Error('denoise-step-by-step: type 이 맞지 않는다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('denoise-step-by-step: stepMs 가 양수가 아니다');
  if (!isNumArray(r.start) || r.start.length === 0) throw new Error('denoise-step-by-step: start 가 수 배열이 아니다');
  const dim = r.start.length;
  if (!Array.isArray(r.samples) || r.samples.length < 2) throw new Error('denoise-step-by-step: samples 가 둘 이상이어야 한다');
  const samples: DenoiseSample[] = r.samples.map((s, i) => {
    if (typeof s !== 'object' || s === null) throw new Error(`denoise-step-by-step: samples[${i}] 가 객체가 아니다`);
    const o = s as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') throw new Error(`denoise-step-by-step: samples[${i}].id 가 없다`);
    if (!isNumArray(o.cells) || o.cells.length !== dim) {
      throw new Error(`denoise-step-by-step: samples[${i}].cells 의 길이가 start 와 다르다`);
    }
    return { id: o.id, cells: [...o.cells] };
  });
  if (!isNumArray(r.betas) || r.betas.length === 0) throw new Error('denoise-step-by-step: betas 가 수 배열이 아니다');
  for (const b of r.betas) {
    if (!(b > 0 && b < 1)) throw new Error(`denoise-step-by-step: β ${b} 가 (0, 1) 밖이다`);
  }
  const T = r.betas.length;
  if (!Array.isArray(r.noise) || r.noise.length !== T - 1) {
    throw new Error(`denoise-step-by-step: noise 는 t = ${T}..2 의 ${T - 1} 개여야 한다`);
  }
  const noise = r.noise.map((z, i) => {
    if (!isNumArray(z) || z.length !== dim) throw new Error(`denoise-step-by-step: noise[${i}] 의 길이가 start 와 다르다`);
    return [...z];
  });
  return {
    type: 'denoise-step-by-step',
    stepMs: r.stepMs,
    samples,
    betas: [...r.betas],
    start: [...r.start],
    noise,
  };
}

/** ᾱ_1..ᾱ_T — 돌려주는 배열의 칸 k 가 ᾱ_{k+1} */
export function alphaBars(betas: readonly number[]): number[] {
  const out: number[] = [];
  let acc = 1;
  for (const b of betas) {
    acc *= 1 - b;
    out.push(acc);
  }
  return out;
}

function sqDist(a: readonly number[], b: readonly number[], scale: number): number {
  if (a.length !== b.length) throw new Error('denoise-step-by-step: 길이가 다른 벡터');
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i]! - scale * b[i]!;
    s += d * d;
  }
  return s;
}

export type Prediction = { epsHat: number[]; x0Hat: number[]; weights: number[] };

/** 이상적 예측기 — 자료가 samples 뿐일 때 x_t 에 섞인 잡음을 맞힌다 */
export function predictNoise(x: readonly number[], alphaBar: number, samples: readonly DenoiseSample[]): Prediction {
  if (!(alphaBar > 0 && alphaBar < 1)) throw new Error(`denoise-step-by-step: ᾱ ${alphaBar} 가 (0, 1) 밖이다`);
  const rootAb = Math.sqrt(alphaBar);
  const logits = samples.map((s) => -sqDist(x, s.cells, rootAb) / (2 * (1 - alphaBar)));
  const top = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - top));
  const sum = ex.reduce((a, b) => a + b, 0);
  const weights = ex.map((e) => e / sum);
  const x0Hat = x.map((_, i) => samples.reduce((acc, s, k) => acc + weights[k]! * s.cells[i]!, 0));
  const rootOneMinus = Math.sqrt(1 - alphaBar);
  const epsHat = x.map((v, i) => (v - rootAb * x0Hat[i]!) / rootOneMinus);
  for (const v of [...weights, ...x0Hat, ...epsHat]) {
    if (!Number.isFinite(v)) throw new Error('denoise-step-by-step: 예측이 수가 아니다');
  }
  return { epsHat, x0Hat, weights };
}

export async function denoiseStepByStep(ctx: FacetContext<DenoiseStepByStepFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<DenoiseStepByStepFacetData>;
  const data = readDenoiseData(ctx.data);
  const stepMs = data.stepMs;
  const T = data.betas.length;
  const abar = alphaBars(data.betas);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let x = [...data.start];
  for (let tIndex = T; tIndex >= 1; tIndex -= 1) {
    if (!(await pause())) return;
    const ab = abar[tIndex - 1]!;
    const beta = data.betas[tIndex - 1]!;
    const pred = predictNoise(x, ab, data.samples);
    await ctx.emit({
      type: 'predict',
      payload: { tIndex, epsHat: pred.epsHat, x0Hat: pred.x0Hat, weights: pred.weights },
    });

    if (!(await pause())) return;
    const coef = beta / Math.sqrt(1 - ab);
    const rootAlpha = Math.sqrt(1 - beta);
    const mean = x.map((v, i) => (v - coef * pred.epsHat[i]!) / rootAlpha);
    let sigma = 0;
    let next = mean;
    if (tIndex > 1) {
      const z = data.noise[T - tIndex];
      if (z === undefined) throw new Error(`denoise-step-by-step: t ${tIndex} 의 새 잡음이 없다`);
      sigma = Math.sqrt(beta);
      next = mean.map((m, i) => m + sigma * z[i]!);
    }
    const distances = data.samples.map((s) => Math.sqrt(sqDist(next, s.cells, 1)));
    await ctx.emit({
      type: 'denoise',
      payload: { tIndex, mean, sigma, next, distances },
    });
    x = next;
  }
}
