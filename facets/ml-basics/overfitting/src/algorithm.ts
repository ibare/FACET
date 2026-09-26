/**
 * overfitting — 같은 유연함(차수)이라도 훈련 점이 많으면 덜 외우는가.
 *
 * 손잡이 둘: 훈련 점 수 n (8 · 16 · 32) × 차수 d (0 … 6). 점 집합은 겹쳐 있어(8 ⊂ 16 ⊂ 32) n 을 올리면
 * 있던 점은 제자리에 남고 그 사이로 새 점이 들어선다. 맞춤은 에폭 없는 닫힌 셈 한 번 — 정규 방정식
 * (XᵀX)c = Xᵀy 를 부분 피벗 가우스 소거로 푼다. 검증 점 스물은 맞춤에 쓰지 않는다.
 *
 * 셈의 차례 (IR `trainAndVal` 과 같다 — 전 정밀도로 같은 답이 나오도록):
 *   - M 은 (d+1)×(d+2) 펼친 버퍼, M[r·(d+2) + k]. M[r][k] = Σₚ x^(r+k) · M[r][d+1] = Σₚ y·x^r (점 차례로 더함)
 *   - 거듭제곱은 반복 곱 (p = 1 ; k 번 p = p·x)
 *   - 피벗: 열 col 에서 행 col … d 중 |M| 이 엄격히 큰 첫 행, 다르면 행 전체를 맞바꾼다
 *   - 소거: f = M[r][col] / M[col][col], k = col … d+1 에서 M[r][k] ← M[r][k] − f·M[col][k]
 *   - 되짚기: r = d … 0 에서 s = Σ_{k>r} M[r][k]·c[k] (k 오름차순), c[r] = (M[r][d+1] − s) / M[r][r]
 *   - MSE = Σ(ŷ − y)² / n, ŷ = Σᵢ cᵢ·x^i (항마다 q = q·x 로 쌓는다)
 *
 * 동률: 피벗 후보끼리 |M| 이 정확히 같으면 고르기가 차례에 매이므로 던진다. 피벗이 0 이면(풀 수 없는 칸) 던진다.
 * 이 데이터의 스물한 조합에서는 둘 다 걸리지 않는다 (sim 단언 · facet test 가 다시 센다).
 *
 * 이벤트 (payload 스키마 · silent 여부)
 *   init      silent  { xLo, xHi, yLo, yHi, errMax, train: {x, y, level}[], val: {x, y}[], n, d, active: number[] }
 *                     첫 판의 걸음 0. 세로 범위 · 오차 눈금 끝은 스물한 조합 모두를 셈해 덮는 값이다 (무대는 고정한다)
 *   round     걸음    { n, d, active: number[] }                 둘째 판부터의 걸음 0 — 훈련 점이 들어서거나 빠진다
 *   fit       걸음    { n, d, coefficients: number[] }            걸음 1 — 곡선이 선다
 *   train-err 걸음    { mse, residuals: {index, yhat}[] }         걸음 2 — 훈련 점마다 벗어남 (index 는 train 의 자리)
 *   val-err   걸음    { mse, trainMse, residuals: {index, yhat}[] } 걸음 3 — 검증 점마다 벗어남 (index 는 val 의 자리)
 *   phase     silent  { phase }
 *
 * phase 어휘: `fit` · `train-err` · `val-err` (걸음 1 · 2 · 3 의 발신 바로 앞). 걸음 0 은 projector 가 패널을 끈다.
 *
 * 계기: `train-points` (n) · `coefficients` (d + 1) — 판 머리의 걸음 0 에서 지금 값으로 (차이만 보낸다).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** (x, y, 처음 드는 n) — level ≤ n 인 점이 n 의 훈련 점이다. */
export type TrainPoint = [number, number, number];
export type ValPoint = [number, number];

export type OverfittingData = {
  type: 'overfitting';
  stepMs: number;
  train: TrainPoint[];
  val: ValPoint[];
  pointsLadder: number[];
  degreeLadder: number[];
  /** 첫 판의 손잡이 값 */
  points: number;
  degree: number;
};

/** 곡선의 세로 범위를 잴 때 x 구간을 몇 칸으로 나눠 훑는가 (sim 과 같다: 0.01 간격 191 점) */
export const RANGE_SAMPLES = 190;

/** x^k — 반복 곱. */
export function powi(x: number, k: number): number {
  let p = 1;
  for (let i = 0; i < k; i += 1) p = p * x;
  return p;
}

/** 훈련 n 의 점만 골라 x 차례로 — 자리(index)와 함께. */
export function pointsFor(train: TrainPoint[], n: number): { xs: number[]; ys: number[]; index: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const index: number[] = [];
  train.forEach(([x, y, level], i) => {
    if (level <= n) {
      xs.push(x);
      ys.push(y);
      index.push(i);
    }
  });
  if (xs.length !== n) throw new Error(`overfitting: 훈련 점 수 ${n} 에 든 점이 ${xs.length} 개다`);
  return { xs, ys, index };
}

/** 정규 방정식을 부분 피벗 가우스 소거로 — 계수 c₀ … c_d. */
export function fitPoly(xs: number[], ys: number[], d: number): number[] {
  const w = d + 2;
  const n = xs.length;
  const M: number[] = new Array<number>((d + 1) * w).fill(0);
  for (let r = 0; r <= d; r += 1) {
    for (let k = 0; k <= d; k += 1) {
      let s = 0;
      for (let p = 0; p < n; p += 1) s = s + powi(xs[p]!, r + k);
      M[r * w + k] = s;
    }
    let s2 = 0;
    for (let p = 0; p < n; p += 1) s2 = s2 + ys[p]! * powi(xs[p]!, r);
    M[r * w + d + 1] = s2;
  }
  for (let col = 0; col <= d; col += 1) {
    let piv = col;
    for (let r = col + 1; r <= d; r += 1) {
      if (Math.abs(M[r * w + col]!) > Math.abs(M[piv * w + col]!)) piv = r;
    }
    for (let r = col; r <= d; r += 1) {
      if (r !== piv && Math.abs(M[r * w + col]!) === Math.abs(M[piv * w + col]!)) {
        throw new Error(`overfitting: 피벗 후보가 같다 (열 ${col}, 행 ${r} · ${piv})`);
      }
    }
    if (M[piv * w + col] === 0) throw new Error(`overfitting: 열 ${col} 의 피벗이 0 이라 풀 수 없다`);
    if (piv !== col) {
      for (let k = 0; k < w; k += 1) {
        const tmp = M[col * w + k]!;
        M[col * w + k] = M[piv * w + k]!;
        M[piv * w + k] = tmp;
      }
    }
    for (let r = col + 1; r <= d; r += 1) {
      const f = M[r * w + col]! / M[col * w + col]!;
      for (let k = col; k < w; k += 1) M[r * w + k] = M[r * w + k]! - f * M[col * w + k]!;
    }
  }
  const c: number[] = new Array<number>(d + 1).fill(0);
  for (let r = d; r >= 0; r -= 1) {
    let s = 0;
    for (let k = r + 1; k <= d; k += 1) s = s + M[r * w + k]! * c[k]!;
    c[r] = (M[r * w + d + 1]! - s) / M[r * w + r]!;
  }
  return c;
}

/** ŷ = Σᵢ cᵢ·x^i — 무대가 곡선을 찍을 때도 이것을 쓴다. */
export function polyValue(c: number[], x: number): number {
  let yhat = 0;
  let q = 1;
  for (let i = 0; i < c.length; i += 1) {
    yhat = yhat + c[i]! * q;
    q = q * x;
  }
  return yhat;
}

/** MSE = Σ(ŷ − y)² / n. */
export function polyMse(xs: number[], ys: number[], c: number[]): number {
  if (xs.length === 0) throw new Error('overfitting: 점이 없어 MSE 를 셈할 수 없다');
  let s = 0;
  for (let p = 0; p < xs.length; p += 1) {
    const e = polyValue(c, xs[p]!) - ys[p]!;
    s = s + e * e;
  }
  return s / xs.length;
}

export type Fit = { coefficients: number[]; train: number; val: number };

/** 맞추고 두 오차 — IR `trainAndVal` 과 같은 셈. */
export function trainAndVal(xs: number[], ys: number[], vx: number[], vy: number[], d: number): Fit {
  const coefficients = fitPoly(xs, ys, d);
  return { coefficients, train: polyMse(xs, ys, coefficients), val: polyMse(vx, vy, coefficients) };
}

export type Bounds = { xLo: number; xHi: number; yLo: number; yHi: number; errMax: number };

/** 스물한 조합의 맞춤 전부와, 그것을 덮는 축 범위. */
export function allFits(data: OverfittingData): { fits: Map<string, Fit>; bounds: Bounds } {
  const vx = data.val.map((v) => v[0]);
  const vy = data.val.map((v) => v[1]);
  const allX = [...data.train.map((p) => p[0]), ...vx];
  const allY = [...data.train.map((p) => p[1]), ...vy];
  if (allX.length === 0) throw new Error('overfitting: 점이 없다');
  const xLo = Math.min(...allX);
  const xHi = Math.max(...allX);
  let yLo = Math.min(...allY);
  let yHi = Math.max(...allY);
  let errMax = 0;
  const fits = new Map<string, Fit>();
  for (const n of data.pointsLadder) {
    const { xs, ys } = pointsFor(data.train, n);
    for (const d of data.degreeLadder) {
      const fit = trainAndVal(xs, ys, vx, vy, d);
      fits.set(`${n}:${d}`, fit);
      errMax = Math.max(errMax, fit.train, fit.val);
      for (let k = 0; k <= RANGE_SAMPLES; k += 1) {
        const y = polyValue(fit.coefficients, xLo + (k * (xHi - xLo)) / RANGE_SAMPLES);
        yLo = Math.min(yLo, y);
        yHi = Math.max(yHi, y);
      }
    }
  }
  return { fits, bounds: { xLo, xHi, yLo, yHi, errMax } };
}

function fitOf(fits: Map<string, Fit>, n: number, d: number): Fit {
  const fit = fits.get(`${n}:${d}`);
  if (!fit) throw new Error(`overfitting: 사다리 밖의 조합 n ${n} · d ${d}`);
  return fit;
}

function ladderValue(payload: unknown, ladder: number[]): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number' || !ladder.includes(value)) return null;
  return value;
}

export async function overfittingAlgorithm(base: FacetContext<OverfittingData>): Promise<void> {
  const ctx = base as ReactiveContext<OverfittingData>;
  const data = ctx.data;
  if (!data.pointsLadder.includes(data.points)) throw new Error('overfitting: 첫 훈련 점 수가 사다리 밖이다');
  if (!data.degreeLadder.includes(data.degree)) throw new Error('overfitting: 첫 차수가 사다리 밖이다');
  const { fits, bounds } = allFits(data);
  const vx = data.val.map((v) => v[0]);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = { trainPoints: 0, coefficients: 0 };
  const setTrainPoints = (v: number) => {
    ctx.metric('train-points', v - shown.trainPoints);
    shown.trainPoints = v;
  };
  const setCoefficients = (v: number) => {
    ctx.metric('coefficients', v - shown.coefficients);
    shown.coefficients = v;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let n = data.points;
  let d = data.degree;
  let first = true;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const pts = pointsFor(data.train, n);
      const fit = fitOf(fits, n, d);
      setTrainPoints(n);
      setCoefficients(d + 1);

      // 걸음 0 — 점 (훈련 n · 검증 스물)
      if (first) {
        await ctx.emit({
          type: 'init',
          payload: {
            ...bounds,
            train: data.train.map(([x, y, level]) => ({ x, y, level })),
            val: data.val.map(([x, y]) => ({ x, y })),
            n,
            d,
            active: pts.index,
          },
          silent: true,
        });
        first = false;
      } else {
        await ctx.emit({ type: 'round', payload: { n, d, active: pts.index } });
      }
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 1 — 맞춤
      await phase('fit');
      await ctx.emit({ type: 'fit', payload: { n, d, coefficients: fit.coefficients } });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 2 — 훈련 오차
      await phase('train-err');
      await ctx.emit({
        type: 'train-err',
        payload: {
          mse: fit.train,
          residuals: pts.index.map((index, p) => ({ index, yhat: polyValue(fit.coefficients, pts.xs[p]!) })),
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 3 — 검증 오차
      await phase('val-err');
      await ctx.emit({
        type: 'val-err',
        payload: {
          mse: fit.val,
          trainMse: fit.train,
          residuals: vx.map((x, index) => ({ index, yhat: polyValue(fit.coefficients, x) })),
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'points') {
          const v = ladderValue(input.payload, data.pointsLadder);
          if (v === null) continue;
          n = v;
          break;
        }
        if (input.type === 'degree') {
          const v = ladderValue(input.payload, data.degreeLadder);
          if (v === null) continue;
          d = v;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
