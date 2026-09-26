/**
 * noisy-path — 점 하나만 보고 움직이면 가장 가파른 내리막을 따라가는가.
 *
 * 모형 ŷ = w·x + b. 갱신마다 **뽑힌 점 하나**의 기울기로 (w, b) 를 옮긴다.
 * 그 방향이 전체 데이터의 내리막 방향에서 얼마나 비껴 있는지를 함께 셈한다.
 *
 * 규약
 * - 점 하나의 손실 (ŷ − y)², 기울기 (2r·x, 2r), r = ŷ − y
 * - 전체 손실 = 다섯 점 평균 (ŷ − y)², 전체 기울기 = 점 기울기의 평균. 둘 다 갱신 전 자리에서
 * - 갱신 (w, b) ← (w, b) − η·g_점
 * - 비낌 각 = −g_전체 에서 −g_점 으로 돈 각 (도, 반시계 +, atan2(외적, 내적))
 *
 * 이벤트
 * - `init` (silent) — 바탕. 걸음 0 을 갈아 끼운다
 *     payload: {
 *       lossStart: number,                         처음 자리의 전체 손실
 *       center: { w: number; b: number },          전체 손실이 가장 낮은 자리 (그릇의 바닥)
 *       lossMin: number,
 *       contours: { level: number; rx: number; ry: number; rot: number }[],
 *                                                  같은 손실 고리 — 바닥 중심 타원 (rot 은 라디안, rx 가 rot 방향 반지름)
 *       plane: { wMin, wMax, bMin, bMax },         (w, b) 평면의 보일 범위
 *       data:  { xMin, xMax, yMin, yMax },         점 그림의 보일 범위
 *     }
 * - `update` — 갱신 한 번. 한 걸음
 *     payload: {
 *       k: number,                                 몇 번째 갱신 (1 부터)
 *       point: number,                             뽑힌 점 번호 (0 부터)
 *       gPoint: { w: number; b: number },          점 하나의 기울기 (갱신 전 자리)
 *       gFull:  { w: number; b: number },          전체 기울기 (갱신 전 자리)
 *       angle: number,                             비낌 각 (도, 전 정밀도)
 *       from: { w: number; b: number },            갱신 전 자리
 *       to:   { w: number; b: number },            갱신 뒤 자리
 *       lossBefore: number,                        갱신 전 전체 손실
 *       lossAfter: number,                         갱신 뒤 전체 손실
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NoisyPathFacetData = {
  type: 'noisy-path';
  stepMs: number;
  /** 점의 x (번호 0 부터) */
  xs: number[];
  /** 점의 y */
  ys: number[];
  /** 처음 (w, b) */
  start: { w: number; b: number };
  /** 학습률 η */
  eta: number;
  /** 갱신마다 뽑힌 점 번호 — 뽑힌 값 그대로 */
  order: number[];
};

export type WB = { w: number; b: number };

export type NoisyPathContour = { level: number; rx: number; ry: number; rot: number };

export type NoisyPathBase = {
  lossStart: number;
  center: WB;
  lossMin: number;
  contours: NoisyPathContour[];
  plane: { wMin: number; wMax: number; bMin: number; bMax: number };
  data: { xMin: number; xMax: number; yMin: number; yMax: number };
};

export type NoisyPathUpdate = {
  k: number;
  point: number;
  gPoint: WB;
  gFull: WB;
  angle: number;
  from: WB;
  to: WB;
  lossBefore: number;
  lossAfter: number;
};

function finiteNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`noisy-path: ${path} 가 유한한 수가 아니다`);
  }
  return v;
}

function numberList(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) throw new Error(`noisy-path: ${path} 가 배열이 아니다`);
  return v.map((x, i) => finiteNumber(x, `${path}[${i}]`));
}

function readWB(v: unknown, path: string): WB {
  if (typeof v !== 'object' || v === null) throw new Error(`noisy-path: ${path} 가 객체가 아니다`);
  const o = v as Record<string, unknown>;
  return { w: finiteNumber(o.w, `${path}.w`), b: finiteNumber(o.b, `${path}.b`) };
}

/** 좁히개 — 알고리즘과 장면이 함께 부른다. 모양이 어긋나면 던진다. */
export function narrowNoisyPathData(raw: unknown): NoisyPathFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('noisy-path: 자료가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'noisy-path') throw new Error(`noisy-path: type 이 'noisy-path' 가 아니다 (${String(o.type)})`);
  const stepMs = finiteNumber(o.stepMs, 'stepMs');
  const xs = numberList(o.xs, 'xs');
  const ys = numberList(o.ys, 'ys');
  if (xs.length === 0) throw new Error('noisy-path: 점이 없다');
  if (xs.length !== ys.length) throw new Error(`noisy-path: xs(${xs.length}) 와 ys(${ys.length}) 의 길이가 다르다`);
  const start = readWB(o.start, 'start');
  const eta = finiteNumber(o.eta, 'eta');
  if (eta <= 0) throw new Error('noisy-path: eta 가 0 보다 크지 않다');
  const order = numberList(o.order, 'order');
  if (order.length === 0) throw new Error('noisy-path: order 가 비었다');
  order.forEach((i, n) => {
    if (!Number.isInteger(i) || i < 0 || i >= xs.length) {
      throw new Error(`noisy-path: order[${n}] = ${i} 가 점 번호가 아니다`);
    }
  });
  return { type: 'noisy-path', stepMs, xs, ys, start, eta, order };
}

/** 다섯 점 평균 (ŷ − y)² */
export function fullLoss(d: NoisyPathFacetData, p: WB): number {
  let s = 0;
  for (let i = 0; i < d.xs.length; i += 1) {
    const r = p.w * d.xs[i]! + p.b - d.ys[i]!;
    s += r * r;
  }
  return s / d.xs.length;
}

/** 점 하나의 기울기 (2r·x, 2r) */
export function pointGrad(d: NoisyPathFacetData, p: WB, i: number): WB {
  const x = d.xs[i];
  const y = d.ys[i];
  if (x === undefined || y === undefined) throw new Error(`noisy-path: 점 ${i} 가 없다`);
  const r = p.w * x + p.b - y;
  return { w: 2 * r * x, b: 2 * r };
}

/** 점 기울기의 평균 */
export function fullGrad(d: NoisyPathFacetData, p: WB): WB {
  let gw = 0;
  let gb = 0;
  for (let i = 0; i < d.xs.length; i += 1) {
    const g = pointGrad(d, p, i);
    gw += g.w;
    gb += g.b;
  }
  return { w: gw / d.xs.length, b: gb / d.xs.length };
}

/** from 방향에서 to 방향으로 돈 각 (도, 반시계 +) */
export function signedAngleDeg(from: WB, to: WB): number {
  if ((from.w === 0 && from.b === 0) || (to.w === 0 && to.b === 0)) {
    throw new Error('noisy-path: 길이 0 인 방향에는 각이 없다');
  }
  const cross = from.w * to.b - from.b * to.w;
  const dot = from.w * to.w + from.b * to.b;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/** 갱신 전부 — 데이터의 뽑힌 차례를 따라 */
export function computeUpdates(d: NoisyPathFacetData): NoisyPathUpdate[] {
  const out: NoisyPathUpdate[] = [];
  let p: WB = { w: d.start.w, b: d.start.b };
  d.order.forEach((point, n) => {
    const gPoint = pointGrad(d, p, point);
    const gFull = fullGrad(d, p);
    const angle = signedAngleDeg({ w: -gFull.w, b: -gFull.b }, { w: -gPoint.w, b: -gPoint.b });
    const to: WB = { w: p.w - d.eta * gPoint.w, b: p.b - d.eta * gPoint.b };
    out.push({
      k: n + 1,
      point,
      gPoint,
      gFull,
      angle,
      from: p,
      to,
      lossBefore: fullLoss(d, p),
      lossAfter: fullLoss(d, to),
    });
    p = to;
  });
  return out;
}

/** 고리 수와 이웃 고리의 손실 비 — 그릇의 모양을 보이는 그림의 결정이다 (화면에 수로 뜨지 않는다) */
const CONTOUR_COUNT = 7;
const CONTOUR_RATIO = 0.4;

/** 바탕 — 손실 그릇의 바닥 · 고리 · 보일 범위 */
export function computeBase(d: NoisyPathFacetData, updates: NoisyPathUpdate[]): NoisyPathBase {
  const n = d.xs.length;
  let sx = 0;
  let sxx = 0;
  let sy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = d.xs[i]!;
    const y = d.ys[i]!;
    sx += x;
    sxx += x * x;
    sy += y;
    sxy += x * y;
  }
  // 전체 손실 = L_min + dᵀ M d,  M = [[평균 x², 평균 x], [평균 x, 1]]
  const p = sxx / n;
  const q = sx / n;
  const s = 1;
  const det = p * s - q * q;
  if (!(det > 0)) throw new Error('noisy-path: x 가 모두 같아 손실 그릇에 바닥이 하나로 서지 않는다');
  const mw = sxy / n;
  const mb = sy / n;
  const center: WB = { w: (s * mw - q * mb) / det, b: (p * mb - q * mw) / det };
  const lossMin = fullLoss(d, center);
  const lossStart = fullLoss(d, d.start);

  const half = (p + s) / 2;
  const rad = Math.sqrt(((p - s) / 2) ** 2 + q * q);
  const lam1 = half + rad;
  const lam2 = half - rad;
  const rot = 0.5 * Math.atan2(2 * q, p - s);
  const contours: NoisyPathContour[] = [];
  const top = lossStart - lossMin;
  if (!(top > 0)) throw new Error('noisy-path: 처음 자리가 이미 바닥이다');
  for (let j = 0; j < CONTOUR_COUNT; j += 1) {
    const delta = top * CONTOUR_RATIO ** j;
    contours.push({ level: lossMin + delta, rx: Math.sqrt(delta / lam1), ry: Math.sqrt(delta / lam2), rot });
  }

  // (w, b) 평면 — 지나는 자리 전부와 바닥이 들도록
  const ws = [d.start.w, center.w, ...updates.map((u) => u.to.w)];
  const bs = [d.start.b, center.b, ...updates.map((u) => u.to.b)];
  const plane = padRange(Math.min(...ws), Math.max(...ws), Math.min(...bs), Math.max(...bs), 0.08);
  // 점 그림 — 점 전부와, 지나는 (w, b) 의 선이 x 끝에서 닿는 높이
  const xMin = Math.min(...d.xs);
  const xMax = Math.max(...d.xs);
  const lineYs: number[] = [];
  for (const at of [d.start, ...updates.map((u) => u.to)]) {
    lineYs.push(at.w * xMin + at.b, at.w * xMax + at.b);
  }
  const ys = [...d.ys, ...lineYs];
  const dr = padRange(xMin, xMax, Math.min(...ys), Math.max(...ys), 0.08);
  return {
    lossStart,
    center,
    lossMin,
    contours,
    plane: { wMin: plane.aMin, wMax: plane.aMax, bMin: plane.bMin, bMax: plane.bMax },
    data: { xMin: dr.aMin, xMax: dr.aMax, yMin: dr.bMin, yMax: dr.bMax },
  };
}

function padRange(aMin: number, aMax: number, bMin: number, bMax: number, frac: number) {
  const pa = (aMax - aMin) * frac;
  const pb = (bMax - bMin) * frac;
  return { aMin: aMin - pa, aMax: aMax + pa, bMin: bMin - pb, bMax: bMax + pb };
}

export async function noisyPath(ctxIn: FacetContext<NoisyPathFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<NoisyPathFacetData>;
  const d = narrowNoisyPathData(ctx.data);
  const updates = computeUpdates(d);
  const base = computeBase(d, updates);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(d.stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', silent: true, payload: base });
  // 걸음 0 은 이미 읽을 것이 있는 화면(그릇 · 처음 자리 · 손실)이라 첫 갱신 앞에도 머문다
  for (const u of updates) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'update', payload: u });
  }
}
