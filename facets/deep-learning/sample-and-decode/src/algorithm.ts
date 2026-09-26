/**
 * sample-and-decode — 분포 하나에서 z 를 세 번 뽑아 디코더로 되돌린다.
 *
 * 인코더가 이미 내놓은 분포(μ · σ, 잠재 차원 둘)에서 출발한다. 뽑힌 ε 마다
 * 재매개변수화 z = μ + σ ⊙ ε 로 z 를 놓고, 그 z 를 디코더(선형 + 시그모이드)에
 * 넣어 칸 넷의 값을 얻는다. 걸음 0 은 장면의 `initial()` 이 분포에서 채운다.
 *
 * 이벤트:
 *   init    { extent: [number, number][] }  — silent. 잠재 평면의 테를 잡을 자리 목록
 *           (가운데 · 퍼짐의 끝 · 뽑기마다 μ + ε 와 z). 걸음 0 을 갈아 끼운다
 * 나머지는 silent 아님:
 *   draw    { k: number, eps: [number, number], scaled: [number, number],
 *             unscaled: [number, number], z: [number, number] }
 *           k 는 1 부터. scaled = σ ⊙ ε · unscaled = μ + ε (줄기 전 자리) · z = μ + σ ⊙ ε
 *   decode  { k: number, cells: number[], gaps: { a: number, b: number, d: number }[] }
 *           cells 는 칸 넷의 값 σ(Wₖ · z + bₖ). gaps 는 앞선 뽑기 a 마다
 *           이번 뽑기 b(= k) 와의 칸별 가장 큰 차 d
 *
 * 차례: (stepMs) draw 1 → (stepMs) decode 1 → (stepMs) draw 2 → … → decode 3.
 * 걸음 0 이 분포를 이미 보이므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = [number, number];

export type SampleAndDecodeFacetData = {
  type: 'sample-and-decode';
  /** 인코더가 내놓은 가운데 (잠재 차원 둘). */
  mu: Vec2;
  /** 인코더가 내놓은 퍼짐 (표준편차, 잠재 차원 둘). */
  sigma: Vec2;
  /** 표준 정규에서 뽑힌 ε — 뽑기 차례대로. */
  eps: Vec2[];
  /** 디코더 무게 — 칸마다 잠재 차원 둘. */
  weights: Vec2[];
  /** 디코더 치우침 — 칸마다 하나. */
  bias: number[];
  stepMs: number;
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function vec2(v: unknown, where: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) {
    throw new Error(`sample-and-decode: ${where} 는 유한한 수 둘이어야 한다`);
  }
  return [v[0], v[1]];
}

/** initialData 를 좁힌다. 모양이 어긋나면 던진다. */
export function narrowSampleAndDecode(raw: unknown): SampleAndDecodeFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('sample-and-decode: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'sample-and-decode') {
    throw new Error('sample-and-decode: type 이 sample-and-decode 가 아니다');
  }
  const mu = vec2(r.mu, 'mu');
  const sigma = vec2(r.sigma, 'sigma');
  if (sigma[0] <= 0 || sigma[1] <= 0) {
    throw new Error('sample-and-decode: sigma 는 0 보다 커야 한다');
  }
  if (!Array.isArray(r.eps) || r.eps.length === 0) {
    throw new Error('sample-and-decode: eps 가 비었다');
  }
  const eps = r.eps.map((e, i) => vec2(e, `eps[${i}]`));
  if (!Array.isArray(r.weights) || r.weights.length === 0) {
    throw new Error('sample-and-decode: weights 가 비었다');
  }
  const weights = r.weights.map((w, i) => vec2(w, `weights[${i}]`));
  if (!Array.isArray(r.bias) || r.bias.length !== weights.length || !r.bias.every(isNum)) {
    throw new Error('sample-and-decode: bias 는 칸 수만큼의 유한한 수여야 한다');
  }
  const bias = r.bias.slice() as number[];
  if (!isNum(r.stepMs) || r.stepMs <= 0) {
    throw new Error('sample-and-decode: stepMs 가 양수가 아니다');
  }
  return { type: 'sample-and-decode', mu, sigma, eps, weights, bias, stepMs: r.stepMs };
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 재매개변수화 — z = μ + σ ⊙ ε. 줄기 전 자리(μ + ε)와 옮긴 만큼(σ ⊙ ε)도 함께. */
export function reparameterize(
  mu: Vec2,
  sigma: Vec2,
  eps: Vec2,
): { scaled: Vec2; unscaled: Vec2; z: Vec2 } {
  const scaled: Vec2 = [sigma[0] * eps[0], sigma[1] * eps[1]];
  return {
    scaled,
    unscaled: [mu[0] + eps[0], mu[1] + eps[1]],
    z: [mu[0] + scaled[0], mu[1] + scaled[1]],
  };
}

/** 디코더 — 칸ₖ = σ(Wₖ · z + bₖ). */
export function decode(weights: Vec2[], bias: number[], z: Vec2): number[] {
  if (weights.length !== bias.length) {
    throw new Error('sample-and-decode: 무게와 치우침의 칸 수가 다르다');
  }
  return weights.map((w, i) => {
    const b = bias[i];
    if (b === undefined) throw new Error(`sample-and-decode: 칸 ${i} 의 치우침이 없다`);
    return sigmoid(w[0] * z[0] + w[1] * z[1] + b);
  });
}

/** 두 출력의 칸별 차 가운데 가장 큰 것. */
export function largestCellGap(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('sample-and-decode: 두 출력의 칸 수가 다르다');
  }
  let most = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs((a[i] as number) - (b[i] as number));
    if (d > most) most = d;
  }
  return most;
}

/**
 * 잠재 평면의 테를 잡을 자리 목록 — 가운데 · 퍼짐의 끝 · 뽑기마다 줄기 전 자리와 z.
 * 알고리즘이 셈해 silent init 으로 보낸다. 그림은 이 셈을 다시 하지 않는다.
 */
export function latentExtentPoints(mu: Vec2, sigma: Vec2, eps: Vec2[]): Vec2[] {
  const pts: Vec2[] = [
    mu,
    [mu[0] - sigma[0], mu[1] - sigma[1]],
    [mu[0] + sigma[0], mu[1] + sigma[1]],
  ];
  for (const e of eps) {
    const r = reparameterize(mu, sigma, e);
    pts.push(r.unscaled, r.z);
  }
  return pts;
}

export async function sampleAndDecode(
  ctx: FacetContext<SampleAndDecodeFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<SampleAndDecodeFacetData>;
  const data = narrowSampleAndDecode(ctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { extent: latentExtentPoints(data.mu, data.sigma, data.eps) },
  });

  const outputs: number[][] = [];
  for (let i = 0; i < data.eps.length; i += 1) {
    if (!(await pause())) return;
    const e = data.eps[i] as Vec2;
    const k = i + 1;
    const r = reparameterize(data.mu, data.sigma, e);
    await ctx.emit({
      type: 'draw',
      payload: { k, eps: [e[0], e[1]], scaled: r.scaled, unscaled: r.unscaled, z: r.z },
    });

    if (!(await pause())) return;
    const cells = decode(data.weights, data.bias, r.z);
    const gaps = outputs.map((prev, j) => ({ a: j + 1, b: k, d: largestCellGap(prev, cells) }));
    outputs.push(cells);
    await ctx.emit({ type: 'decode', payload: { k, cells, gaps } });
  }
}
