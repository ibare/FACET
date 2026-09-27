/**
 * 특이값 분해 세 걸음 — 단위원이 A 를 한 번에 거치는 대신 Vᵀ · Σ · U 를 차례로 거친다.
 *
 * 2×2 행렬 A 를 닫힌 식으로 A = U · Σ · Vᵀ 로 쪼갠다. AᵀA 의 고유값을 큰 것부터 σ₁² · σ₂²,
 * v₁ 은 큰 고유값의 고유벡터(각 θv ∈ (−90°, 90°]), v₂ 는 v₁ 을 반시계 90° 돌린 것.
 * det A > 0 이라 U · V 를 둘 다 회전으로 잡는다 — u₁ = A·v₁ / σ₁ 의 각이 θu.
 * 그러면 Vᵀ = R(−θv) · Σ = diag(σ₁, σ₂) · U = R(θu).
 *
 * 이벤트 (좌표는 모두 수학 좌표 — 위가 +y. 각은 도):
 *
 *   init           silent. 바탕.
 *                  { matrix: [[a, b], [c, d]], det, sigma1, sigma2, thetaV, thetaU,
 *                    circle: {x, y}[], v: [{x, y}, {x, y}] }
 *                  circle 은 단위원의 표본점 (initialData.samples 개), v 는 v₁ · v₂.
 *   turn-in        걸음 1 — Vᵀ = R(−θv) 를 곱한다.
 *                  { motion: { kind: 'rotate', deg }, points: {x, y}[], v: [{x, y}, {x, y}],
 *                    arcFrom }   arcFrom 은 곱하기 전 v₁ 의 각 (돈 각의 호가 여기서 출발한다)
 *   stretch        걸음 2 — Σ = diag(σ₁, σ₂) 를 곱한다.
 *                  { motion: { kind: 'stretch', sx, sy }, points, v }
 *   turn-out       걸음 3 — U = R(θu) 를 곱한다. payload 모양은 turn-in 과 같다.
 *   direct         걸음 4 — 단위원에 A 를 한 번에 곱한다.
 *                  { points: {x, y}[], gap, same }   points 는 표본점마다의 A·p.
 *                  gap 은 세 걸음의 결과와 A·p 의 점별 거리 중 가장 큰 것, same 은 gap ≤ 1e−9.
 *
 * silent 는 init 하나뿐이다. 걸음은 넷 (걸음 0 을 넣어 다섯).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = { x: number; y: number };
export type Mat2 = [[number, number], [number, number]];

export type SvdThreeStepsFacetData = {
  type: 'svd-three-steps';
  /** 행 차례의 2×2 행렬 */
  matrix: Mat2;
  /** 단위원 표본점 개수 */
  samples: number;
  stepMs: number;
};

/** 걸음마다의 동작. 그림이 도중 모양을 셈할 때 `motionAt` 으로 같은 식을 쓴다. */
export type Motion =
  | { kind: 'rotate'; deg: number }
  | { kind: 'stretch'; sx: number; sy: number };

const SAME_TOL = 1e-9;

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** 2×2 행렬 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function readMat2(x: unknown, path: string): Mat2 {
  if (!Array.isArray(x) || x.length !== 2) throw new Error(`${path}: 2×2 행렬이 아니다`);
  const rows = x.map((row: unknown, i) => {
    if (!Array.isArray(row) || row.length !== 2 || !isNum(row[0]) || !isNum(row[1])) {
      throw new Error(`${path}[${i}]: 수 두 개의 행이 아니다`);
    }
    return [row[0], row[1]] as [number, number];
  });
  return [rows[0]!, rows[1]!];
}

/** 자료 좁히개 — 알고리즘과 장면 · 무대가 같은 것을 부른다. */
export function readSvdData(x: unknown): SvdThreeStepsFacetData {
  if (typeof x !== 'object' || x === null) throw new Error('initialData: 객체가 아니다');
  const o = x as Record<string, unknown>;
  if (o['type'] !== 'svd-three-steps') throw new Error(`initialData.type: 'svd-three-steps' 가 아니다`);
  const matrix = readMat2(o['matrix'], 'initialData.matrix');
  const samples = o['samples'];
  if (!isNum(samples) || !Number.isInteger(samples) || samples < 8) {
    throw new Error('initialData.samples: 8 이상의 정수가 아니다');
  }
  const stepMs = o['stepMs'];
  if (!isNum(stepMs) || stepMs <= 0) throw new Error('initialData.stepMs: 양수가 아니다');
  return { type: 'svd-three-steps', matrix, samples, stepMs };
}

const RAD = Math.PI / 180;

export function rotate(p: Pt, deg: number): Pt {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

export function apply(m: Mat2, p: Pt): Pt {
  return { x: m[0][0] * p.x + m[0][1] * p.y, y: m[1][0] * p.x + m[1][1] * p.y };
}

/** 각 (도, 반시계, [0, 360)) */
export function angleOf(p: Pt): number {
  const a = Math.atan2(p.y, p.x) / RAD;
  return a < 0 ? a + 360 : a;
}

/**
 * 동작의 도중 모양. s ∈ [0, 1] — 0 은 곱하기 전, 1 은 곱한 뒤.
 * 회전은 각을 나눠 실제로 돌고, 늘이기는 배수를 1 에서 σ 까지 나눈다.
 */
export function motionAt(motion: Motion, s: number, p: Pt): Pt {
  switch (motion.kind) {
    case 'rotate':
      return rotate(p, motion.deg * s);
    case 'stretch':
      return { x: p.x * (1 + (motion.sx - 1) * s), y: p.y * (1 + (motion.sy - 1) * s) };
  }
}

/** 2×2 닫힌 식의 SVD. det ≤ 0 이면 회전 · 늘이기 · 회전이 되지 않아 던진다. */
export function svd2(a: Mat2): {
  det: number;
  sigma1: number;
  sigma2: number;
  thetaV: number;
  thetaU: number;
} {
  const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  if (!(det > 0)) throw new Error(`matrix: det ${det} — 양수라야 U · V 가 둘 다 회전이다`);
  // AᵀA = [[p, q], [q, r]]
  const p = a[0][0] * a[0][0] + a[1][0] * a[1][0];
  const q = a[0][0] * a[0][1] + a[1][0] * a[1][1];
  const r = a[0][1] * a[0][1] + a[1][1] * a[1][1];
  const mid = (p + r) / 2;
  const rad = Math.hypot((p - r) / 2, q);
  const l1 = mid + rad;
  const l2 = mid - rad;
  if (!(l2 > 0)) throw new Error(`matrix: AᵀA 의 작은 고유값 ${l2} 이 양수가 아니다`);
  const sigma1 = Math.sqrt(l1);
  const sigma2 = Math.sqrt(l2);
  // 큰 고유값의 고유벡터 각 — 0.5·atan2 는 (−90°, 90°] 에 든다
  const thetaV = (0.5 * Math.atan2(2 * q, p - r)) / RAD;
  const v1 = rotate({ x: 1, y: 0 }, thetaV);
  const av1 = apply(a, v1);
  const thetaU = Math.atan2(av1.y, av1.x) / RAD;
  return { det, sigma1, sigma2, thetaV, thetaU };
}

export async function svdThreeSteps(ctx: FacetContext<SvdThreeStepsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SvdThreeStepsFacetData>;
  const data = readSvdData(ctx.data);
  const { matrix, samples, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const { det, sigma1, sigma2, thetaV, thetaU } = svd2(matrix);

  const circle: Pt[] = [];
  for (let i = 0; i < samples; i += 1) {
    if (ctx.cancelled) return;
    const ang = (360 * i) / samples;
    circle.push(rotate({ x: 1, y: 0 }, ang));
  }
  const v1 = rotate({ x: 1, y: 0 }, thetaV);
  const v2 = rotate(v1, 90);

  // 셋째 걸음의 결과가 A 와 같은지는 마지막 걸음이 점마다 잰다. 여기서는 v₂ 쪽도 맞는지 먼저 본다
  const av2 = apply(matrix, v2);
  const u2 = rotate({ x: sigma2, y: 0 }, thetaU + 90);
  if (Math.hypot(av2.x - u2.x, av2.y - u2.y) > SAME_TOL) {
    throw new Error('svd: A·v₂ 가 σ₂·u₂ 와 다르다 — 부호 규약이 어긋났다');
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      matrix: [[...matrix[0]], [...matrix[1]]],
      det,
      sigma1,
      sigma2,
      thetaV,
      thetaU,
      circle,
      v: [v1, v2],
    },
  });

  // 걸음 0 은 단위원과 v₁ · v₂ 가 이미 서 있다 — 읽을 틈을 둔다
  if (!(await pause())) return;

  const turnIn: Motion = { kind: 'rotate', deg: -thetaV };
  const p1 = circle.map((p) => motionAt(turnIn, 1, p));
  const w1: [Pt, Pt] = [motionAt(turnIn, 1, v1), motionAt(turnIn, 1, v2)];
  await ctx.emit({
    type: 'turn-in',
    payload: { motion: turnIn, points: p1, v: w1, arcFrom: angleOf(v1) },
  });
  if (!(await pause())) return;

  const stretch: Motion = { kind: 'stretch', sx: sigma1, sy: sigma2 };
  const p2 = p1.map((p) => motionAt(stretch, 1, p));
  const w2: [Pt, Pt] = [motionAt(stretch, 1, w1[0]), motionAt(stretch, 1, w1[1])];
  await ctx.emit({ type: 'stretch', payload: { motion: stretch, points: p2, v: w2 } });
  if (!(await pause())) return;

  const turnOut: Motion = { kind: 'rotate', deg: thetaU };
  const p3 = p2.map((p) => motionAt(turnOut, 1, p));
  const w3: [Pt, Pt] = [motionAt(turnOut, 1, w2[0]), motionAt(turnOut, 1, w2[1])];
  await ctx.emit({
    type: 'turn-out',
    payload: { motion: turnOut, points: p3, v: w3, arcFrom: angleOf(w2[0]) },
  });
  if (!(await pause())) return;

  const direct = circle.map((p) => apply(matrix, p));
  let gap = 0;
  for (let i = 0; i < direct.length; i += 1) {
    if (ctx.cancelled) return;
    const a = direct[i]!;
    const b = p3[i]!;
    gap = Math.max(gap, Math.hypot(a.x - b.x, a.y - b.y));
  }
  await ctx.emit({
    type: 'direct',
    payload: { points: direct, gap, same: gap <= SAME_TOL },
  });
}
