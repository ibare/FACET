/**
 * power-iteration-drift — 벡터 하나에 같은 행렬을 거듭 곱하면 방향이 큰 고유값의 방향으로 쏠린다.
 *
 * 걸음 k (1..n) 는 w = A·v_{k−1} 을 셈하고, 늘어난 배수 |w| 로 나눠 v_k = w / |w| 로
 * 길이를 1 로 되돌린다 (길이로 정규화). 방향과 큰 고유 방향 사이의 틈이 걸음마다 준다.
 *
 * 이벤트
 *   init      (silent) 걸음 0 의 바탕. payload:
 *               { lambda1: number, lambda2: number,      // 고유값, 큰 것부터 (2×2 닫힌 식)
 *                 targetAngle: number,                    // 큰 고유 방향의 각 (도, [0, 360))
 *                 start: Sample,                          // 걸음 0 의 v₀
 *                 gapTop: number, gapBottom: number,      // 틈 축의 범위 (도, 걸음 전체의 최대 · 최소)
 *                 count: number }                         // 곱하는 횟수
 *   multiply  걸음 k 의 곱 하나. payload: Sample (k ≥ 1)
 *
 * Sample = { k: number,
 *            w: [number, number] | null,                  // 곱한 직후 A·v_{k−1} (걸음 0 은 null)
 *            stretch: number | null,                      // |w| (걸음 0 은 null)
 *            v: [number, number],                         // 길이 1 로 되돌린 v_k
 *            angle: number,                               // v_k 의 각 (도, [0, 360))
 *            gap: number,                                 // |v_k 의 각 − 큰 고유 방향의 각| (도)
 *            ratio: number | null }                       // 틈_k / 틈_{k−1} (걸음 0 은 null)
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = [number, number];
export type Mat2 = [[number, number], [number, number]];

export type PowerIterationDriftFacetData = {
  type: 'power-iteration-drift';
  stepMs: number;
  /** 행 차례 2×2 행렬 */
  matrix: Mat2;
  /** 시작 벡터 v₀ */
  start: Vec2;
  /** 곱하는 횟수 */
  multiplications: number;
};

export type Sample = {
  k: number;
  w: Vec2 | null;
  stretch: number | null;
  v: Vec2;
  angle: number;
  gap: number;
  ratio: number | null;
};

export type Basis = {
  lambda1: number;
  lambda2: number;
  targetAngle: number;
  start: Sample;
  gapTop: number;
  gapBottom: number;
  count: number;
};

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`power-iteration-drift: ${path} 는 유한한 수여야 한다 (${String(value)})`);
  }
  return value;
}

function pair(value: unknown, path: string): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`power-iteration-drift: ${path} 는 수 두 개여야 한다`);
  }
  return [finite(value[0], `${path}[0]`), finite(value[1], `${path}[1]`)];
}

/** initialData 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowPowerIterationDriftData(raw: unknown): PowerIterationDriftFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('power-iteration-drift: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'power-iteration-drift') {
    throw new Error(`power-iteration-drift: initialData.type 이 다르다 (${String(d.type)})`);
  }
  const stepMs = finite(d.stepMs, 'initialData.stepMs');
  if (stepMs < 0) throw new Error('power-iteration-drift: initialData.stepMs 가 음수다');
  if (!Array.isArray(d.matrix) || d.matrix.length !== 2) {
    throw new Error('power-iteration-drift: initialData.matrix 는 두 행이어야 한다');
  }
  const matrix: Mat2 = [pair(d.matrix[0], 'initialData.matrix[0]'), pair(d.matrix[1], 'initialData.matrix[1]')];
  const start = pair(d.start, 'initialData.start');
  if (start[0] === 0 && start[1] === 0) {
    throw new Error('power-iteration-drift: initialData.start 가 영벡터다');
  }
  const multiplications = finite(d.multiplications, 'initialData.multiplications');
  if (!Number.isInteger(multiplications) || multiplications < 1) {
    throw new Error('power-iteration-drift: initialData.multiplications 는 1 이상의 정수여야 한다');
  }
  return { type: 'power-iteration-drift', stepMs, matrix, start, multiplications };
}

export function multiply(m: Mat2, v: Vec2): Vec2 {
  return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]];
}

export function lengthOf(v: Vec2): number {
  return Math.hypot(v[0], v[1]);
}

/** +x 축에서 반시계로 잰 각 (도, [0, 360)). */
export function angleDeg(v: Vec2): number {
  const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/** 두 각의 틈 (도, [0, 180]). */
export function gapDeg(a: number, b: number): number {
  let diff = (((a - b) % 360) + 360) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

type Eigen = { lambda1: number; lambda2: number; e1: Vec2; e2: Vec2 };

function eigenvectorFor(m: Mat2, lambda: number): Vec2 {
  const [[a, b], [c, d]] = m;
  if (b !== 0) return [b, lambda - a];
  if (c !== 0) return [lambda - d, c];
  // 대각 행렬 — 축이 곧 고유 방향
  return lambda === a ? [1, 0] : [0, 1];
}

/** 2×2 닫힌 식. 실수이고 크기가 우세한 큰 고유값이 하나여야 한다. */
function eigen2(m: Mat2): Eigen {
  const [[a, b], [c, d]] = m;
  const half = (a + d) / 2;
  const disc = half * half - (a * d - b * c);
  if (disc <= 0) {
    throw new Error('power-iteration-drift: 서로 다른 실수 고유값이 둘이어야 한다');
  }
  const root = Math.sqrt(disc);
  const lambda1 = half + root;
  const lambda2 = half - root;
  if (Math.abs(lambda1) <= Math.abs(lambda2)) {
    throw new Error('power-iteration-drift: 큰 고유값이 크기로 우세해야 한다');
  }
  return { lambda1, lambda2, e1: eigenvectorFor(m, lambda1), e2: eigenvectorFor(m, lambda2) };
}

/** 곱하기 전부를 셈한다 — 걸음 0 부터 n 까지. */
export function iterate(data: PowerIterationDriftFacetData): Basis & { steps: Sample[] } {
  const eig = eigen2(data.matrix);
  // v₀ = a·e1 + b·e2 로 풀어 a 의 부호로 v 가 다가갈 쪽을 고른다
  const det = eig.e1[0] * eig.e2[1] - eig.e2[0] * eig.e1[1];
  const coefA = (data.start[0] * eig.e2[1] - eig.e2[0] * data.start[1]) / det;
  if (Math.abs(coefA) < 1e-9) {
    throw new Error('power-iteration-drift: 시작 벡터에 큰 고유 방향의 성분이 없다');
  }
  const target: Vec2 = coefA > 0 ? eig.e1 : [-eig.e1[0], -eig.e1[1]];
  const targetAngle = angleDeg(target);

  const len0 = lengthOf(data.start);
  const v0: Vec2 = [data.start[0] / len0, data.start[1] / len0];
  const a0 = angleDeg(v0);
  const start: Sample = { k: 0, w: null, stretch: null, v: v0, angle: a0, gap: gapDeg(a0, targetAngle), ratio: null };

  const steps: Sample[] = [];
  let prev = start;
  for (let k = 1; k <= data.multiplications; k += 1) {
    const w = multiply(data.matrix, prev.v);
    const stretch = lengthOf(w);
    const v: Vec2 = [w[0] / stretch, w[1] / stretch];
    const angle = angleDeg(v);
    const gap = gapDeg(angle, targetAngle);
    const ratio = prev.gap > 0 ? gap / prev.gap : null;
    const sample: Sample = { k, w, stretch, v, angle, gap, ratio };
    steps.push(sample);
    prev = sample;
  }

  const gaps = [start.gap, ...steps.map((s) => s.gap)];
  return {
    lambda1: eig.lambda1,
    lambda2: eig.lambda2,
    targetAngle,
    start,
    gapTop: Math.max(...gaps),
    gapBottom: Math.min(...gaps),
    count: data.multiplications,
    steps,
  };
}

export async function powerIterationDrift(
  ctx: FacetContext<PowerIterationDriftFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<PowerIterationDriftFacetData>;
  const data = narrowPowerIterationDriftData(rctx.data);
  const { steps, ...basis } = iterate(data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({ type: 'init', payload: basis, silent: true });

  // 걸음 0 이 이미 읽을 화면이라 첫 곱 앞에도 stepMs 를 둔다
  for (const sample of steps) {
    if (!(await pause())) return;
    await rctx.emit({ type: 'multiply', payload: sample });
  }
}
