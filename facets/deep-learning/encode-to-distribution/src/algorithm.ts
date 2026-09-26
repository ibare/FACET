/**
 * encode-to-distribution — VAE 의 인코더가 입력 하나를 잠재 축 위의 점이 아니라 퍼짐으로 담는다.
 *
 * 인코더는 선형 머리 둘이다. 가운데 머리가 μ = Σ wᵢxᵢ + b 를, 퍼짐 머리가 log σ² = Σ vᵢxᵢ + b′ 를 내고,
 * σ = exp(½ · log σ²) 이다. 입력마다 두 걸음 — μ 가 놓이는 걸음, σ 만큼 번지는 걸음. 마지막 걸음은
 * 데이터가 고른 두 입력의 μ 사이 가운데 자리 z 에서 세 퍼짐의 정규 밀도와 "μ±σ 안에 드는가" 를 셈한다.
 *
 * 이벤트
 * - `init`   { lo: number; hi: number; peak: number }  — silent. 걸음 0 의 바탕.
 *     lo · hi 는 입력 전체의 min(μ − 2σ) · max(μ + 2σ) (잠재 축에 담을 범위),
 *     peak 는 가장 높은 봉우리의 밀도 max N(μ; μ, σ) (세로 축척).
 * 아래는 silent 아님 — 하나가 걸음 하나다.
 * - `place`  { index: number; mu: number }
 *     입력 index 의 가운데 μ 가 잠재 축에 놓인다.
 * - `spread` { index: number; logVar: number; sigma: number; lo: number; hi: number;
 *              overlaps: { other: number; lo: number; hi: number; width: number }[] }
 *     입력 index 가 σ 만큼 번진다. lo · hi = μ ∓ σ. overlaps 는 앞서 번진 입력 가운데 μ±σ 가
 *     이 입력의 μ±σ 와 겹치는 것과 그 겹침 구간 · 폭.
 * - `probe`  { z: number; left: number; right: number; densities: number[];
 *              inside: number[]; onPoint: number[] }
 *     z = (μ_left + μ_right) / 2. densities 는 입력 차례대로 N(z; μ, σ).
 *     inside 는 |z − μ| ≤ σ 인 입력, onPoint 는 μ = z 인 입력의 번호.
 *
 * 무작위가 없다. 이 조각은 뽑지 않는다 — z = μ + σ·ε 와 디코더는 다른 조각의 말이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EncoderHead = { w: number[]; b: number };
export type EncodeInput = { id: string; x: number[] };

export type EncodeToDistributionFacetData = {
  type: 'encode-to-distribution';
  stepMs: number;
  inputs: EncodeInput[];
  meanHead: EncoderHead;
  logVarHead: EncoderHead;
  /** 가운데 자리를 셈할 두 입력의 식별자 */
  probeBetween: [string, string];
};

export type Encoding = { mu: number; logVar: number; sigma: number };

function readNumber(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`encode-to-distribution: ${where} 가 유한한 수가 아니다`);
  }
  return v;
}

function readVector(v: unknown, where: string): number[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`encode-to-distribution: ${where} 가 비지 않은 배열이 아니다`);
  }
  return v.map((e, i) => readNumber(e, `${where}[${i}]`));
}

function readHead(v: unknown, where: string): EncoderHead {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`encode-to-distribution: ${where} 가 객체가 아니다`);
  }
  const o = v as Record<string, unknown>;
  return { w: readVector(o.w, `${where}.w`), b: readNumber(o.b, `${where}.b`) };
}

/** initialData 를 좁힌다. 모양이 어긋나면 던진다. */
export function readEncodeData(raw: unknown): EncodeToDistributionFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('encode-to-distribution: initialData 가 없다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'encode-to-distribution') {
    throw new Error(`encode-to-distribution: type 이 다르다 (${String(o.type)})`);
  }
  const stepMs = readNumber(o.stepMs, 'stepMs');
  if (!Array.isArray(o.inputs) || o.inputs.length === 0) {
    throw new Error('encode-to-distribution: inputs 가 비지 않은 배열이 아니다');
  }
  const inputs = o.inputs.map((e: unknown, i: number): EncodeInput => {
    if (typeof e !== 'object' || e === null) {
      throw new Error(`encode-to-distribution: inputs[${i}] 가 객체가 아니다`);
    }
    const r = e as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') {
      throw new Error(`encode-to-distribution: inputs[${i}].id 가 없다`);
    }
    return { id: r.id, x: readVector(r.x, `inputs[${i}].x`) };
  });
  const ids = new Set(inputs.map((e) => e.id));
  if (ids.size !== inputs.length) {
    throw new Error('encode-to-distribution: inputs 의 id 가 겹친다');
  }
  const meanHead = readHead(o.meanHead, 'meanHead');
  const logVarHead = readHead(o.logVarHead, 'logVarHead');
  for (const input of inputs) {
    if (input.x.length !== meanHead.w.length || input.x.length !== logVarHead.w.length) {
      throw new Error(`encode-to-distribution: 입력 ${input.id} 의 길이가 머리의 무게와 맞지 않는다`);
    }
  }
  const pb = o.probeBetween;
  if (
    !Array.isArray(pb) ||
    pb.length !== 2 ||
    typeof pb[0] !== 'string' ||
    typeof pb[1] !== 'string' ||
    !ids.has(pb[0]) ||
    !ids.has(pb[1]) ||
    pb[0] === pb[1]
  ) {
    throw new Error('encode-to-distribution: probeBetween 은 서로 다른 입력 id 둘이어야 한다');
  }
  return { type: 'encode-to-distribution', stepMs, inputs, meanHead, logVarHead, probeBetween: [pb[0], pb[1]] };
}

function linear(head: EncoderHead, x: number[]): number {
  if (head.w.length !== x.length) {
    throw new Error('encode-to-distribution: 무게와 입력의 길이가 다르다');
  }
  let sum = head.b;
  for (let i = 0; i < x.length; i += 1) sum += head.w[i]! * x[i]!;
  return sum;
}

/** 인코더 — 입력 하나를 가운데 μ 와 퍼짐 σ 로 */
export function encode(data: EncodeToDistributionFacetData, x: number[]): Encoding {
  const mu = linear(data.meanHead, x);
  const logVar = linear(data.logVarHead, x);
  const sigma = Math.exp(0.5 * logVar);
  if (!(sigma > 0) || !Number.isFinite(sigma)) {
    throw new Error('encode-to-distribution: σ 를 셈할 수 없다');
  }
  return { mu, logVar, sigma };
}

/** 정규 밀도 N(v; μ, σ) — 그림이 곡선을 그릴 때도 이것을 부른다 */
export function normalDensity(v: number, mu: number, sigma: number): number {
  if (!(sigma > 0)) throw new Error('encode-to-distribution: σ 가 0 이하다');
  const d = v - mu;
  return Math.exp(-(d * d) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
}

export async function encodeToDistribution(
  context: FacetContext<EncodeToDistributionFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<EncodeToDistributionFacetData>;
  const data = readEncodeData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const encodings: Encoding[] = data.inputs.map((e) => encode(data, e.x));
  let lo = Infinity;
  let hi = -Infinity;
  let peak = 0;
  for (const e of encodings) {
    if (ctx.cancelled) return;
    lo = Math.min(lo, e.mu - 2 * e.sigma);
    hi = Math.max(hi, e.mu + 2 * e.sigma);
    peak = Math.max(peak, normalDensity(e.mu, e.mu, e.sigma));
  }
  await ctx.emit({ type: 'init', silent: true, payload: { lo, hi, peak } });
  const spreadSoFar: number[] = [];

  // 걸음 0 은 입력 셋이 이미 보이는 화면이라 첫 발신 앞에도 문을 둔다.
  for (let index = 0; index < data.inputs.length; index += 1) {
    if (!(await pause())) return;
    const enc = encodings[index]!;
    await ctx.emit({ type: 'place', payload: { index, mu: enc.mu } });

    if (!(await pause())) return;
    const lo = enc.mu - enc.sigma;
    const hi = enc.mu + enc.sigma;
    const overlaps: { other: number; lo: number; hi: number; width: number }[] = [];
    for (const other of spreadSoFar) {
      if (ctx.cancelled) return;
      const o = encodings[other]!;
      const oLo = Math.max(lo, o.mu - o.sigma);
      const oHi = Math.min(hi, o.mu + o.sigma);
      if (oHi > oLo) overlaps.push({ other, lo: oLo, hi: oHi, width: oHi - oLo });
    }
    spreadSoFar.push(index);
    await ctx.emit({
      type: 'spread',
      payload: { index, logVar: enc.logVar, sigma: enc.sigma, lo, hi, overlaps },
    });
  }

  if (!(await pause())) return;
  const left = data.inputs.findIndex((e) => e.id === data.probeBetween[0]);
  const right = data.inputs.findIndex((e) => e.id === data.probeBetween[1]);
  const z = (encodings[left]!.mu + encodings[right]!.mu) / 2;
  const densities = encodings.map((e) => normalDensity(z, e.mu, e.sigma));
  const inside: number[] = [];
  const onPoint: number[] = [];
  encodings.forEach((e, i) => {
    if (Math.abs(z - e.mu) <= e.sigma) inside.push(i);
    if (e.mu === z) onPoint.push(i);
  });
  await ctx.emit({ type: 'probe', payload: { z, left, right, densities, inside, onPoint } });
}
