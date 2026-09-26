/**
 * add-noise-then-remove — 확산의 전방 과정과 알려진 잡음의 되돌림.
 *
 * 원본 x₀ 에 한 번 뽑은 잡음 ε 를 t 마다 x_t = √ᾱ_t · x₀ + √(1 − ᾱ_t) · ε 로
 * 섞는다 (각 t 를 x₀ 에서 바로 셈하는 DDPM 의 닫힌 꼴). ᾱ_t = Π_{s=1..t} (1 − β_s).
 * 끝에서 섞인 ε 를 그대로 안다고 치고 x̂₀ = (x₅ − √(1 − ᾱ₅) · ε) / √ᾱ₅ 로 되돌린다.
 *
 * 이벤트:
 *   init    — (silent) 걸음 0 을 세운다. ᾱ₀ = 1 에서 셈한 t 0 의 몫과 칸. payload 는 mix 와 같다 (tIndex 0).
 *   mix     — (silent 아님) t 하나를 섞었다.
 *             payload {
 *               tIndex: number,         // 1..β 의 개수
 *               alphaBar: number,       // ᾱ_t
 *               signal: number,         // 원본의 몫 √ᾱ_t
 *               noise: number,          // 잡음의 몫 √(1 − ᾱ_t)
 *               sumSquares: number,     // signal² + noise²
 *               signalParts: number[],  // 칸마다 signal · x₀
 *               noiseParts: number[],   // 칸마다 noise · ε
 *               values: number[],       // 칸마다 x_t = signalParts + noiseParts
 *             }
 *   revert  — (silent 아님) 마지막 x_t 에서 섞인 ε 를 덜어 내고 원본의 몫으로 나눴다.
 *             payload {
 *               removed: number,        // 덜어 낸 잡음의 몫 √(1 − ᾱ_T)
 *               divisor: number,        // 나눈 원본의 몫 √ᾱ_T
 *               afterRemove: number[],  // 칸마다 x_T − removed · ε
 *               recovered: number[],    // 칸마다 afterRemove / divisor
 *               maxGap: number,         // 칸마다 |recovered − x₀| 의 가장 큰 값
 *               after: { signal: number, noise: number },  // 되돌린 칸의 몫 (divisor / divisor · 0)
 *             }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AddNoiseThenRemoveFacetData = {
  type: 'add-noise-then-remove';
  stepMs: number;
  /** 원본 칸 값 x₀ (−1..1 로 맞춘 값) */
  origin: number[];
  /** 한 번 뽑아 모든 t 에 쓰는 잡음 ε */
  noise: number[];
  /** 잡음 일정 β₁..β_T */
  betas: number[];
};

function finiteList(value: unknown, name: string): number[] {
  if (!Array.isArray(value)) throw new Error(`add-noise-then-remove: ${name} 가 배열이 아니다`);
  return value.map((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`add-noise-then-remove: ${name}[${i}] 가 유한한 수가 아니다`);
    }
    return v;
  });
}

/** initialData 를 좁힌다. 모양이 어긋나면 던진다. 장면도 같은 좁히개를 쓴다. */
export function narrowAddNoiseThenRemoveData(raw: unknown): AddNoiseThenRemoveFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('add-noise-then-remove: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'add-noise-then-remove') {
    throw new Error('add-noise-then-remove: type 이 맞지 않는다');
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) {
    throw new Error('add-noise-then-remove: stepMs 가 양수가 아니다');
  }
  const origin = finiteList(r.origin, 'origin');
  const noise = finiteList(r.noise, 'noise');
  const betas = finiteList(r.betas, 'betas');
  if (origin.length === 0) throw new Error('add-noise-then-remove: 원본 칸이 없다');
  if (origin.length !== noise.length) {
    throw new Error('add-noise-then-remove: 원본과 잡음의 칸 수가 다르다');
  }
  if (betas.length === 0) throw new Error('add-noise-then-remove: 잡음 일정이 없다');
  betas.forEach((b, i) => {
    if (!(b > 0 && b < 1)) throw new Error(`add-noise-then-remove: betas[${i}] 가 0 과 1 사이가 아니다`);
  });
  return { type: 'add-noise-then-remove', stepMs: r.stepMs, origin, noise, betas };
}

export async function addNoiseThenRemove(
  ctxBase: FacetContext<AddNoiseThenRemoveFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<AddNoiseThenRemoveFacetData>;
  const data = narrowAddNoiseThenRemoveData(ctx.data);
  const { origin, noise, betas, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // t 하나의 섞임을 셈한다 — x_t 를 x₀ 에서 바로.
  function mixAt(tIndex: number, alphaBar: number) {
    const signal = Math.sqrt(alphaBar);
    const noiseShare = Math.sqrt(1 - alphaBar);
    const signalParts = origin.map((x) => signal * x);
    const noiseParts = noise.map((e) => noiseShare * e);
    const values = signalParts.map((s, k) => s + noiseParts[k]!);
    return {
      tIndex,
      alphaBar,
      signal,
      noise: noiseShare,
      sumSquares: signal * signal + noiseShare * noiseShare,
      signalParts,
      noiseParts,
      values,
    };
  }

  // 걸음 0 — ᾱ₀ = 1. silent 라 걸음 0 을 갈아 끼운다.
  let alphaBar = 1;
  let last = mixAt(0, alphaBar);
  await ctx.emit({ type: 'init', payload: last, silent: true });

  // 걸음 0 은 원본이 이미 보이는 화면이라 첫 발신 앞에도 읽을 틈을 둔다.
  for (let i = 0; i < betas.length; i += 1) {
    if (!(await pause())) return;
    alphaBar *= 1 - betas[i]!;
    last = mixAt(i + 1, alphaBar);
    await ctx.emit({ type: 'mix', payload: last });
  }
  const signal = last.signal;
  const noiseShare = last.noise;
  const lastValues = last.values;

  if (!(await pause())) return;
  if (!(signal > 0)) throw new Error('add-noise-then-remove: 원본의 몫이 0 이라 나눌 수 없다');
  const afterRemove = lastValues.map((x, k) => x - noiseShare * noise[k]!);
  const recovered = afterRemove.map((v) => v / signal);
  const maxGap = recovered.reduce((m, v, k) => Math.max(m, Math.abs(v - origin[k]!)), 0);
  await ctx.emit({
    type: 'revert',
    payload: {
      removed: noiseShare,
      divisor: signal,
      afterRemove,
      recovered,
      maxGap,
      after: { signal: signal / signal, noise: 0 },
    },
  });
}
