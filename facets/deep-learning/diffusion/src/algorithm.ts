/**
 * diffusion — 확산 모형의 역과정. 걷어내는 횟수 T 를 손잡이로 돌린다.
 *
 * 같은 잡음 x_T 에서 출발한 표본 다섯이 t = T, T−1, …, 1 을 하나씩 걷어내며(DDPM 조상 샘플링)
 * 평면 위를 내려선다. 예측기는 배운 자료 둘(P · Q)만 아는 이상적 예측기다.
 *
 * ── 셈 (한 번만 적는다 — IR `denoiseStep` · `nearest` 가 이 모양 그대로다) ──
 *   일정  β = 1 − exp(log(alphaBarEnd) / T) · ᾱ_t 는 곱 루프 prod = prod · (1 − β) (t = 1..T)
 *   한 t  sa = √ᾱ_t · s1a = √(1 − ᾱ_t)
 *         lp = Σ_i (x_i − sa·P_i)² · lq = Σ_i (x_i − sa·Q_i)²  (성분 0 → 1)
 *         lp = −lp / (2·(1 − ᾱ_t)) · lq 같게 · m = max(lp, lq) · eP = exp(lp − m) · eQ = exp(lq − m)
 *         w_P = eP / (eP + eQ) · w_Q = eQ / (eP + eQ)
 *         x̂₀_i = w_P·P_i + w_Q·Q_i · ε̂_i = (x_i − sa·x̂₀_i) / s1a
 *         평균_i = (x_i − β / s1a · ε̂_i) / √(1 − β)
 *         t > 1 이면 x_{t−1,i} = 평균_i + √β · z_i, t = 1 이면 평균_i
 *   닿음  거리 = √min(dP, dQ) (dP = Σ(x_i − P_i)²) · 거리 < settleDistance 면 닿음 · 가까운 쪽은 dP < dQ 면 P
 *         (동률 규칙: dP == dQ 면 Q. 이 데이터에서 |dP − dQ| 최소는 0.005 로 동률은 걸리지 않는다)
 *
 * ── 생성기 (표본마다 제 씨앗 하나 · IR 에 두지 않는다) ──
 *   Park–Miller 최소 표준: x ← 48271 · x mod 2147483647, u = x / 2147483647
 *   표준 정규: Box–Muller 코사인 쪽 — u1, u2 를 차례로 뽑아 √(−2·log u1) · cos(2π·u2)
 *   뽑는 차례: x_T 성분 0 → 성분 1 → t = T, T−1, …, 2 의 z 성분 0 → 성분 1. t = 1 은 뽑지 않는다 (z = [0, 0]).
 *
 * ── 이벤트 (payload · silent) ──
 *   diffusion-init   silent  { plane: { xMin, xMax, yMin, yMax }, dataP: [x, y], dataQ: [x, y], sampleCount }
 *                            — 한 번, 처음에. 평면 범위와 자료 자리를 싣는다
 *   round-start      걸음 0  { steps, beta, xT: [x, y][], durationMs } — 판 머리. 뒤에 sleep(stepMs)
 *   reverse-step     t 걸음  { tIndex, tNext, alphaBar, wP: number[], x0Hat: [x, y][], xPrev: [x, y][], durationMs }
 *   settle-read      끝 걸음 { distance: number[], nearest: ('P' | 'Q')[], reached: boolean[], reachedCount, durationMs }
 *   phase            silent  { phase } — 그 걸음의 발신(reverse-step · settle-read) **앞에** 보낸다.
 *                            자취(되짚기)는 silent 아닌 발신에서 걸음을 끊으므로 뒤에 두면 다음 걸음에 묶인다
 *
 * ── phase 어휘 (irs.ts 와 같다) ──
 *   reverse — t 걸음마다 (denoiseStep) · settle — 끝 걸음 (nearest). 걸음 0 은 phase 없음 (projector 가 highlightPhase(null)).
 *
 * ── 계기 ──
 *   denoise-steps — 이 판에서 걷어낸 t 수 (t 걸음마다 +1) · settled — 닿은 표본 수 (끝 걸음에서만, 그 전 0).
 *   판 머리에서 둘 다 0 으로 되돌린다 (지금 값을 들고 차이만 보낸다).
 *
 * ── 손잡이 ──
 *   steps (value ∈ stepsLadder). 한 판을 끝까지 재생 → waitForInput → 받은 T 로 처음 상태 · 같은 씨앗에서 다시.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Point = [number, number];

export type DiffusionData = {
  type: 'diffusion';
  stepMs: number;
  settleMs: number;
  tStepMs: number[];
  stepsLadder: number[];
  defaultSteps: number;
  dataP: number[];
  dataQ: number[];
  alphaBarEnd: number;
  settleDistance: number;
  plane: { xMin: number; xMax: number; yMin: number; yMax: number };
  seeds: number[];
};

const MODULUS = 2147483647;
const MULTIPLIER = 48271;

function isNumberList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** ctx.data 의 좁히개 — 모양이 어긋나면 던진다. */
export function readDiffusionData(raw: unknown): DiffusionData {
  if (typeof raw !== 'object' || raw === null) throw new Error('diffusion: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'diffusion') throw new Error('diffusion: data.type 이 diffusion 이 아니다');
  const num = (k: string): number => {
    const v = d[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`diffusion: ${k} 가 수가 아니다`);
    return v;
  };
  const list = (k: string): number[] => {
    const v = d[k];
    if (!isNumberList(v)) throw new Error(`diffusion: ${k} 가 수 목록이 아니다`);
    return v;
  };
  const stepsLadder = list('stepsLadder');
  const tStepMs = list('tStepMs');
  const seeds = list('seeds');
  const dataP = list('dataP');
  const dataQ = list('dataQ');
  if (stepsLadder.length === 0) throw new Error('diffusion: stepsLadder 가 비었다');
  if (!stepsLadder.every((v) => Number.isInteger(v) && v >= 1)) throw new Error('diffusion: T 는 1 이상 정수');
  if (tStepMs.length !== stepsLadder.length) throw new Error('diffusion: tStepMs 가 사다리와 길이가 다르다');
  if (seeds.length !== 5) throw new Error('diffusion: seeds 는 다섯이다');
  if (!seeds.every((s) => Number.isInteger(s) && s >= 1 && s < MODULUS)) {
    throw new Error('diffusion: 씨앗은 1 ≤ x < 2³¹−1 정수');
  }
  if (dataP.length !== 2 || dataQ.length !== 2) throw new Error('diffusion: 자료는 두 성분 점');
  const defaultSteps = num('defaultSteps');
  if (!stepsLadder.includes(defaultSteps)) throw new Error('diffusion: defaultSteps 가 사다리에 없다');
  const alphaBarEnd = num('alphaBarEnd');
  if (!(alphaBarEnd > 0 && alphaBarEnd < 1)) throw new Error('diffusion: alphaBarEnd 는 0 과 1 사이');
  const p = d.plane;
  if (typeof p !== 'object' || p === null) throw new Error('diffusion: plane 이 없다');
  const pl = p as Record<string, unknown>;
  const plane = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  for (const k of ['xMin', 'xMax', 'yMin', 'yMax'] as const) {
    const v = pl[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`diffusion: plane.${k} 가 수가 아니다`);
    plane[k] = v;
  }
  if (!(plane.xMin < plane.xMax && plane.yMin < plane.yMax)) throw new Error('diffusion: plane 범위가 뒤집혔다');
  return {
    type: 'diffusion',
    stepMs: num('stepMs'),
    settleMs: num('settleMs'),
    tStepMs,
    stepsLadder,
    defaultSteps,
    dataP,
    dataQ,
    alphaBarEnd,
    settleDistance: num('settleDistance'),
    plane,
    seeds,
  };
}

/** Park–Miller 최소 표준 생성기. 곱의 최대 ≈ 1.04e14 < 2⁵³ 이라 number 로 정확하다. */
export class ParkMiller {
  private x: number;
  constructor(seed: number) {
    if (!(Number.isInteger(seed) && seed >= 1 && seed < MODULUS)) throw new Error('씨앗은 1 ≤ x < 2³¹−1');
    this.x = seed;
  }
  uniform(): number {
    this.x = (MULTIPLIER * this.x) % MODULUS;
    return this.x / MODULUS;
  }
  /** Box–Muller 코사인 쪽. */
  normal(): number {
    const u1 = this.uniform();
    const u2 = this.uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/** 일정 — 같은 β 와 곱 루프의 ᾱ_1..ᾱ_T (색인 t − 1). */
export function diffusionSchedule(steps: number, alphaBarEnd: number): { beta: number; alphaBar: number[] } {
  const beta = 1 - Math.exp(Math.log(alphaBarEnd) / steps);
  const alphaBar: number[] = [];
  let prod = 1;
  for (let i = 0; i < steps; i += 1) {
    prod = prod * (1 - beta);
    alphaBar.push(prod);
  }
  return { beta, alphaBar };
}

/** IR `denoiseStep` 과 한 글자씩 같은 셈. x0Hat · xPrev 는 부르는 쪽이 준 버퍼. 반환 w_P. */
export function denoiseStep(
  xt: number[],
  dataP: number[],
  dataQ: number[],
  alphaBar: number,
  beta: number,
  noise: number[],
  tIndex: number,
  x0Hat: number[],
  xPrev: number[],
): number {
  const n = xt.length;
  const sa = Math.sqrt(alphaBar);
  const s1a = Math.sqrt(1 - alphaBar);
  let lp = 0.0;
  let lq = 0.0;
  for (let i = 0; i < n; i += 1) {
    const dp = xt[i]! - sa * dataP[i]!;
    const dq = xt[i]! - sa * dataQ[i]!;
    lp = lp + dp * dp;
    lq = lq + dq * dq;
  }
  lp = -lp / (2 * (1 - alphaBar));
  lq = -lq / (2 * (1 - alphaBar));
  const m = Math.max(lp, lq);
  const eP = Math.exp(lp - m);
  const eQ = Math.exp(lq - m);
  const wP = eP / (eP + eQ);
  const wQ = eQ / (eP + eQ);
  for (let i = 0; i < n; i += 1) {
    x0Hat[i] = wP * dataP[i]! + wQ * dataQ[i]!;
  }
  for (let i = 0; i < n; i += 1) {
    const epsHat = (xt[i]! - sa * x0Hat[i]!) / s1a;
    const mean = (xt[i]! - (beta / s1a) * epsHat) / Math.sqrt(1 - beta);
    if (tIndex > 1) {
      xPrev[i] = mean + Math.sqrt(beta) * noise[i]!;
    } else {
      xPrev[i] = mean;
    }
  }
  return wP;
}

/** IR `nearest` — 가까운 자료까지의 거리. */
export function nearest(x: number[], dataP: number[], dataQ: number[]): number {
  let dP = 0.0;
  let dQ = 0.0;
  for (let i = 0; i < x.length; i += 1) {
    dP = dP + (x[i]! - dataP[i]!) * (x[i]! - dataP[i]!);
    dQ = dQ + (x[i]! - dataQ[i]!) * (x[i]! - dataQ[i]!);
  }
  return Math.sqrt(Math.min(dP, dQ));
}

export type ReverseRecord = {
  tIndex: number;
  alphaBar: number;
  noise: Point;
  x: Point;
  wP: number;
  x0Hat: Point;
  xPrev: Point;
};

export type SampleRun = {
  xT: Point;
  trail: ReverseRecord[];
  end: Point;
  distance: number;
  nearestSide: 'P' | 'Q';
  reached: boolean;
};

export type DiffusionRound = { steps: number; beta: number; samples: SampleRun[] };

function inPlane(pt: number[], plane: DiffusionData['plane']): void {
  const [x, y] = pt;
  if (x === undefined || y === undefined) throw new Error('diffusion: 점이 두 성분이 아니다');
  if (x < plane.xMin || x > plane.xMax || y < plane.yMin || y > plane.yMax) {
    throw new Error(`diffusion: 점 (${x}, ${y}) 가 평면 밖이다`);
  }
}

/** 한 판 전부를 셈한다 — 처음 상태 · 같은 씨앗에서. */
export function runDiffusionRound(data: DiffusionData, steps: number): DiffusionRound {
  const { beta, alphaBar } = diffusionSchedule(steps, data.alphaBarEnd);
  const samples: SampleRun[] = [];
  for (const seed of data.seeds) {
    const rng = new ParkMiller(seed);
    const c0 = rng.normal();
    const c1 = rng.normal();
    const xT: Point = [c0, c1];
    const noiseByT = new Map<number, Point>();
    for (let tIndex = steps; tIndex >= 2; tIndex -= 1) {
      const z0 = rng.normal();
      const z1 = rng.normal();
      noiseByT.set(tIndex, [z0, z1]);
    }
    noiseByT.set(1, [0, 0]);
    inPlane(xT, data.plane);
    let x: Point = [xT[0], xT[1]];
    const trail: ReverseRecord[] = [];
    for (let tIndex = steps; tIndex >= 1; tIndex -= 1) {
      const ab = alphaBar[tIndex - 1];
      const z = noiseByT.get(tIndex);
      if (ab === undefined || z === undefined) throw new Error('diffusion: 일정 · 잡음이 비었다');
      const x0Hat: Point = [0, 0];
      const xPrev: Point = [0, 0];
      const wP = denoiseStep(x, data.dataP, data.dataQ, ab, beta, z, tIndex, x0Hat, xPrev);
      inPlane(x0Hat, data.plane);
      inPlane(xPrev, data.plane);
      trail.push({ tIndex, alphaBar: ab, noise: z, x, wP, x0Hat, xPrev });
      x = xPrev;
    }
    let dP = 0;
    let dQ = 0;
    for (let i = 0; i < 2; i += 1) {
      dP += (x[i]! - data.dataP[i]!) ** 2;
      dQ += (x[i]! - data.dataQ[i]!) ** 2;
    }
    const distance = nearest(x, data.dataP, data.dataQ);
    samples.push({
      xT,
      trail,
      end: x,
      distance,
      nearestSide: dP < dQ ? 'P' : 'Q',
      reached: distance < data.settleDistance,
    });
  }
  return { steps, beta, samples };
}

export async function diffusionAlgorithm(ctx0: FacetContext<DiffusionData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<DiffusionData>;
  const data = readDiffusionData(ctx.data);

  const shown = { denoiseSteps: 0, settled: 0 };
  const setDenoiseSteps = (v: number): void => {
    ctx.metric('denoise-steps', v - shown.denoiseSteps);
    shown.denoiseSteps = v;
  };
  const setSettled = (v: number): void => {
    ctx.metric('settled', v - shown.settled);
    shown.settled = v;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  try {
    await ctx.emit({
      type: 'diffusion-init',
      payload: {
        plane: { ...data.plane },
        dataP: [data.dataP[0], data.dataP[1]],
        dataQ: [data.dataQ[0], data.dataQ[1]],
        sampleCount: data.seeds.length,
      },
      silent: true,
    });

    let steps = data.defaultSteps;
    for (;;) {
      if (ctx.cancelled) return;
      const round = runDiffusionRound(data, steps);
      const ladderIndex = data.stepsLadder.indexOf(steps);
      const tStepMs = data.tStepMs[ladderIndex];
      if (tStepMs === undefined) throw new Error('diffusion: tStepMs 가 사다리 값에 없다');

      // 걸음 0 — x_T 다섯. 계기는 0 으로.
      setDenoiseSteps(0);
      setSettled(0);
      await ctx.emit({
        type: 'round-start',
        payload: {
          steps,
          beta: round.beta,
          xT: round.samples.map((s) => [s.xT[0], s.xT[1]]),
          durationMs: data.stepMs,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // t 걸음 — t = T..1
      for (let k = 0; k < steps; k += 1) {
        if (ctx.cancelled) return;
        const recs = round.samples.map((s) => {
          const r = s.trail[k];
          if (r === undefined) throw new Error('diffusion: 자국이 모자란다');
          return r;
        });
        const first = recs[0];
        if (first === undefined) throw new Error('diffusion: 표본이 없다');
        // phase 는 걸음 발신 앞에 — 자취는 silent 아닌 발신에서 걸음을 끊는다
        await phase('reverse');
        await ctx.emit({
          type: 'reverse-step',
          payload: {
            tIndex: first.tIndex,
            tNext: first.tIndex - 1,
            alphaBar: first.alphaBar,
            wP: recs.map((r) => r.wP),
            x0Hat: recs.map((r) => [r.x0Hat[0], r.x0Hat[1]]),
            xPrev: recs.map((r) => [r.xPrev[0], r.xPrev[1]]),
            durationMs: tStepMs,
          },
        });
        setDenoiseSteps(k + 1);
        if (!(await ctx.sleep(tStepMs))) return;
      }

      // 끝 걸음 — 닿음 읽기
      if (ctx.cancelled) return;
      const reachedCount = round.samples.filter((s) => s.reached).length;
      await phase('settle');
      await ctx.emit({
        type: 'settle-read',
        payload: {
          distance: round.samples.map((s) => s.distance),
          nearest: round.samples.map((s) => s.nearestSide),
          reached: round.samples.map((s) => s.reached),
          reachedCount,
          durationMs: data.settleMs,
        },
      });
      setSettled(reachedCount);
      if (!(await ctx.sleep(data.settleMs))) return;

      // 손잡이를 기다린다
      let nextSteps: number | null = null;
      while (nextSteps === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'steps') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error('diffusion: steps 입력에 payload 가 없다');
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') throw new Error('diffusion: steps 입력의 value 가 수가 아니다');
        if (!data.stepsLadder.includes(value)) throw new Error(`diffusion: T ${value} 는 사다리에 없다`);
        nextSteps = value;
      }
      steps = nextSteps;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
