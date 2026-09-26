/**
 * two-nets-compete — 만드는 쪽과 가려내는 쪽이 번갈아 한 번씩 배운다.
 *
 * 모형 (1 차원)
 *   만드는 쪽   G(z) = z + b
 *   가려내는 쪽 D(x) = sigmoid(w·x + c)
 *   V = 평균 log D(진짜) + 평균 log(1 − D(가짜))
 *   라운드 하나 = 가려내는 쪽 한 번(V 를 올리는 쪽으로 경사 상승) → 만드는 쪽 한 번
 *   (방금 갱신된 D 로 평균 log D(G(z)) 를 올리는 쪽). 두 쪽 모두 전체 표본으로 한 번씩.
 *     ∂V/∂w = 평균_진짜 (1 − D(x))·x − 평균_가짜 D(x)·x
 *     ∂V/∂c = 평균_진짜 (1 − D(x))   − 평균_가짜 D(x)
 *     ∂/∂b  = 평균 (1 − D(z + b))·w
 *
 * 이벤트
 *   init (silent) — 걸음 0 을 채운다
 *     payload { w, c, b, fakes: number[], meanReal, meanFake, v, gap,
 *               realCenter, rounds, vLow, vHigh, xLow, xHigh }
 *       gap = meanReal − meanFake · vLow/vHigh = 모든 라운드의 V 의 아래·위 끝
 *       xLow/xHigh = 진짜와 모든 라운드의 가짜가 놓이는 자리의 아래·위 끝
 *   discriminate — 가려내는 쪽 갱신 한 번
 *     payload { round, w, c, meanReal, meanFake, v, gap, dv }
 *       dv = 이번 V − 앞 V (셈한 값, 자르지 않음)
 *   generate — 만드는 쪽 갱신 한 번
 *     payload { round, b, fakes: number[], meanReal, meanFake, v, gap, dv,
 *               moved, final, fakeCenter }
 *       moved = 이번 b − 앞 b · final = 마지막 라운드인가 · fakeCenter = 가짜의 평균
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TwoNetsCompeteFacetData = {
  type: 'two-nets-compete';
  stepMs: number;
  /** 진짜 표본 (1 차원) */
  real: number[];
  /** 만드는 쪽의 잡음 — 라운드마다 같은 것을 쓴다 */
  noise: number[];
  generator: { b: number };
  discriminator: { w: number; c: number };
  rates: { generator: number; discriminator: number };
  rounds: number;
};

/** 시그모이드. 표준편차 σ 와 이름을 가른다. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 가려내는 쪽의 점수 D(x). 그림이 곡선을 그릴 때도 이것을 부른다. */
export function discriminatorScore(w: number, c: number, x: number): number {
  return sigmoid(w * x + c);
}

function finiteNumber(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`two-nets-compete: ${where} 는 유한한 수여야 한다`);
  }
  return value;
}

function numberList(value: unknown, where: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`two-nets-compete: ${where} 는 비지 않은 수 배열이어야 한다`);
  }
  return value.map((item, i) => finiteNumber(item, `${where}[${i}]`));
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`two-nets-compete: ${where} 는 객체여야 한다`);
  }
  return value as Record<string, unknown>;
}

/** initialData 좁히개 — 모양이 어긋나면 던진다. */
export function narrowTwoNetsCompeteData(value: unknown): TwoNetsCompeteFacetData {
  const d = record(value, 'initialData');
  if (d.type !== 'two-nets-compete') {
    throw new Error('two-nets-compete: initialData.type 이 two-nets-compete 가 아니다');
  }
  const generator = record(d.generator, 'generator');
  const discriminator = record(d.discriminator, 'discriminator');
  const rates = record(d.rates, 'rates');
  const rounds = finiteNumber(d.rounds, 'rounds');
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error('two-nets-compete: rounds 는 1 이상의 정수여야 한다');
  }
  return {
    type: 'two-nets-compete',
    stepMs: finiteNumber(d.stepMs, 'stepMs'),
    real: numberList(d.real, 'real'),
    noise: numberList(d.noise, 'noise'),
    generator: { b: finiteNumber(generator.b, 'generator.b') },
    discriminator: {
      w: finiteNumber(discriminator.w, 'discriminator.w'),
      c: finiteNumber(discriminator.c, 'discriminator.c'),
    },
    rates: {
      generator: finiteNumber(rates.generator, 'rates.generator'),
      discriminator: finiteNumber(rates.discriminator, 'rates.discriminator'),
    },
    rounds,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('two-nets-compete: 빈 배열의 평균은 셀 수 없다');
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

type Measure = { meanReal: number; meanFake: number; v: number; gap: number };

function measure(w: number, c: number, real: readonly number[], fakes: readonly number[]): Measure {
  const dReal = real.map((x) => discriminatorScore(w, c, x));
  const dFake = fakes.map((x) => discriminatorScore(w, c, x));
  for (const d of [...dReal, ...dFake]) {
    if (!(d > 0 && d < 1)) throw new Error('two-nets-compete: 점수가 0 또는 1 에 닿아 log 를 셀 수 없다');
  }
  const meanReal = mean(dReal);
  const meanFake = mean(dFake);
  const v = mean(dReal.map(Math.log)) + mean(dFake.map((d) => Math.log(1 - d)));
  return { meanReal, meanFake, v, gap: meanReal - meanFake };
}

type Snapshot = Measure & { kind: 'start' | 'discriminate' | 'generate'; round: number; w: number; c: number; b: number; fakes: number[] };

/** 라운드를 모두 셈한다 — 걸음 0 부터 마지막 만듦까지. */
function train(data: TwoNetsCompeteFacetData): Snapshot[] {
  const { real, noise, rates } = data;
  let { w, c } = data.discriminator;
  let { b } = data.generator;
  const place = (bias: number): number[] => noise.map((z) => z + bias);
  const out: Snapshot[] = [{ kind: 'start', round: 0, w, c, b, fakes: place(b), ...measure(w, c, real, place(b)) }];
  for (let round = 1; round <= data.rounds; round += 1) {
    const fakes = place(b);
    // 가려내는 쪽 — 경사 상승
    const gw =
      mean(real.map((x) => (1 - discriminatorScore(w, c, x)) * x)) -
      mean(fakes.map((x) => discriminatorScore(w, c, x) * x));
    const gc =
      mean(real.map((x) => 1 - discriminatorScore(w, c, x))) -
      mean(fakes.map((x) => discriminatorScore(w, c, x)));
    w += rates.discriminator * gw;
    c += rates.discriminator * gc;
    out.push({ kind: 'discriminate', round, w, c, b, fakes, ...measure(w, c, real, fakes) });
    // 만드는 쪽 — 방금 갱신된 D 로
    const gb = mean(fakes.map((x) => (1 - discriminatorScore(w, c, x)) * w));
    b += rates.generator * gb;
    const moved = place(b);
    out.push({ kind: 'generate', round, w, c, b, fakes: moved, ...measure(w, c, real, moved) });
  }
  return out;
}

export async function twoNetsCompete(rawCtx: FacetContext<TwoNetsCompeteFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<TwoNetsCompeteFacetData>;
  const data = narrowTwoNetsCompeteData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const snaps = train(data);
  const first = snaps[0];
  if (first === undefined) throw new Error('two-nets-compete: 처음 상태를 셈하지 못했다');

  const vs = snaps.map((s) => s.v);
  const xs = [...data.real, ...snaps.flatMap((s) => s.fakes)];

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      w: first.w,
      c: first.c,
      b: first.b,
      fakes: first.fakes,
      meanReal: first.meanReal,
      meanFake: first.meanFake,
      v: first.v,
      gap: first.gap,
      realCenter: mean(data.real),
      rounds: data.rounds,
      vLow: Math.min(...vs),
      vHigh: Math.max(...vs),
      xLow: Math.min(...xs),
      xHigh: Math.max(...xs),
    },
  });

  let prev = first;
  for (const snap of snaps.slice(1)) {
    // 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 발신 앞에도 머문다
    if (!(await pause())) return;
    const dv = snap.v - prev.v;
    if (snap.kind === 'discriminate') {
      await ctx.emit({
        type: 'discriminate',
        payload: {
          round: snap.round,
          w: snap.w,
          c: snap.c,
          meanReal: snap.meanReal,
          meanFake: snap.meanFake,
          v: snap.v,
          gap: snap.gap,
          dv,
        },
      });
    } else if (snap.kind === 'generate') {
      await ctx.emit({
        type: 'generate',
        payload: {
          round: snap.round,
          b: snap.b,
          fakes: snap.fakes,
          meanReal: snap.meanReal,
          meanFake: snap.meanFake,
          v: snap.v,
          gap: snap.gap,
          dv,
          moved: snap.b - prev.b,
          final: snap.round === data.rounds,
          fakeCenter: mean(snap.fakes),
        },
      });
    } else {
      throw new Error('two-nets-compete: 처음 상태가 두 번 나왔다');
    }
    prev = snap;
  }
}
