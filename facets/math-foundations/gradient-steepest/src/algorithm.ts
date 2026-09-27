/**
 * gradient-steepest — 한 점에서 재는 방향이 한 바퀴 돌며 그 방향의 기울기가 오르내리고,
 * 끝에 두 편미분으로 만든 ∇f 가 선다.
 *
 * 방향 u = (cos θ, sin θ) 의 기울기는 그 방향 단면의 가운데 차분
 * (f(p + δu) − f(p − δu)) / (2δ) 로 잰다. ∇f 로 셈하지 않는다 — ∇f 가 곧 주장이라
 * 셈이 순환한다. ∇f = (∂f/∂x, ∂f/∂y) 는 항 목록을 거듭제곱 규칙으로 미분해 셈하고,
 * 그 방향의 기울기도 같은 가운데 차분으로 잰다. 점은 움직이지 않는다.
 *
 * 이벤트 (발신 순서대로)
 *
 * - `init` (silent) — 걸음 0 의 바탕.
 *   payload: { point: [number, number]; f: number; angles: number[]; range: number }
 *     point  재는 점 (1차 데이터 그대로)
 *     f      그 점의 함숫값
 *     angles 잴 방향의 각(도) 목록 — startDeg 에서 stepDeg 씩 count 개
 *     range  화면이 담아야 할 기울기 크기의 상한 — 잰 기울기 전부와 |∇f| 가운데 가장 큰 절댓값
 *
 * - `measure` — 방향 하나를 잰다. 걸음 1 … count.
 *   payload: { index: number; angle: number; slope: number }
 *     angle  방향(도, +x 축에서 시계 반대로)
 *     slope  그 방향의 기울기 (가운데 차분)
 *
 * - `gradient` — 한 바퀴 뒤 ∇f 가 선다. 마지막 걸음.
 *   payload: {
 *     gx: number; gy: number;       ∂f/∂x · ∂f/∂y (거듭제곱 규칙)
 *     angle: number;                ∇f 의 각(도, 0 이상 360 미만)
 *     length: number;               |∇f|
 *     slope: number;                ∇f 방향의 기울기 (가운데 차분)
 *     maxAngle: number;             잰 방향 가운데 기울기가 가장 큰 방향
 *     maxSlope: number;             그 기울기
 *     count: number;                잰 방향의 수
 *   }
 *   ∇f 방향의 기울기가 |∇f| 와 허용 오차 1e-6 안에서 같지 않으면 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 두 변수 항 — [계수, x 지수, y 지수] */
export type Term2 = [number, number, number];

export type GradientSteepestFacetData = {
  type: 'gradient-steepest';
  /** f(x, y) = Σ 계수 · x^a · y^b */
  terms: Term2[];
  /** 재는 점 */
  point: [number, number];
  /** 첫 방향(도) */
  startDeg: number;
  /** 방향 사이 각(도) */
  stepDeg: number;
  /** 잴 방향의 수 */
  count: number;
  /** 가운데 차분의 폭 δ */
  delta: number;
  stepMs: number;
};

const EQUAL_TOLERANCE = 1e-6;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 쓴다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowGradientSteepestData(raw: unknown): GradientSteepestFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('gradient-steepest: 자료가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'gradient-steepest') {
    throw new Error(`gradient-steepest: type 이 'gradient-steepest' 가 아니다 (${String(d.type)})`);
  }
  if (!Array.isArray(d.terms) || d.terms.length === 0) {
    throw new Error('gradient-steepest: terms 가 비었거나 배열이 아니다');
  }
  const terms: Term2[] = d.terms.map((term, i) => {
    if (!Array.isArray(term) || term.length !== 3 || !term.every(isFiniteNumber)) {
      throw new Error(`gradient-steepest: terms[${i}] 가 [계수, x 지수, y 지수] 가 아니다`);
    }
    const [c, a, b] = term as number[];
    if (!Number.isInteger(a) || a < 0 || !Number.isInteger(b) || b < 0) {
      throw new Error(`gradient-steepest: terms[${i}] 의 지수가 음이 아닌 정수가 아니다`);
    }
    return [c, a, b] as Term2;
  });
  if (!Array.isArray(d.point) || d.point.length !== 2 || !d.point.every(isFiniteNumber)) {
    throw new Error('gradient-steepest: point 가 [x, y] 가 아니다');
  }
  const point: [number, number] = [d.point[0] as number, d.point[1] as number];
  for (const key of ['startDeg', 'stepDeg', 'count', 'delta', 'stepMs'] as const) {
    if (!isFiniteNumber(d[key])) throw new Error(`gradient-steepest: ${key} 가 수가 아니다`);
  }
  const count = d.count as number;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('gradient-steepest: count 가 1 이상의 정수가 아니다');
  }
  const delta = d.delta as number;
  if (delta <= 0) throw new Error('gradient-steepest: delta 가 양수가 아니다');
  return {
    type: 'gradient-steepest',
    terms,
    point,
    startDeg: d.startDeg as number,
    stepDeg: d.stepDeg as number,
    count,
    delta,
    stepMs: d.stepMs as number,
  };
}

function evaluate(terms: Term2[], x: number, y: number): number {
  let sum = 0;
  for (const [c, a, b] of terms) sum += c * x ** a * y ** b;
  return sum;
}

/** 거듭제곱 규칙으로 한 변수에 대해 미분한 항 목록. 지수 0 인 항은 사라진다. */
function differentiate(terms: Term2[], by: 'x' | 'y'): Term2[] {
  const out: Term2[] = [];
  for (const [c, a, b] of terms) {
    if (by === 'x') {
      if (a > 0) out.push([c * a, a - 1, b]);
    } else if (b > 0) {
      out.push([c * b, a, b - 1]);
    }
  }
  return out;
}

/** 방향 θ(라디안) 의 기울기 — 그 방향 단면의 가운데 차분 */
function directionalSlope(
  terms: Term2[],
  point: [number, number],
  theta: number,
  delta: number,
): number {
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const [x, y] = point;
  const ahead = evaluate(terms, x + delta * ux, y + delta * uy);
  const behind = evaluate(terms, x - delta * ux, y - delta * uy);
  return (ahead - behind) / (2 * delta);
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** 잴 방향 목록 — 바탕에서 정해지는 작은 셈이라 장면도 같은 함수를 부를 수 있다. */
export function sampleAngles(data: GradientSteepestFacetData): number[] {
  const angles: number[] = [];
  for (let i = 0; i < data.count; i += 1) {
    angles.push(data.startDeg + i * data.stepDeg);
  }
  return angles;
}

export async function gradientSteepest(
  rawCtx: FacetContext<GradientSteepestFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<GradientSteepestFacetData>;
  const data = narrowGradientSteepestData(ctx.data);
  const { terms, point, delta, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const angles = sampleAngles(data);
  const samples = angles.map((angle) => ({
    angle,
    slope: directionalSlope(terms, point, toRadians(angle), delta),
  }));

  const gx = evaluate(differentiate(terms, 'x'), point[0], point[1]);
  const gy = evaluate(differentiate(terms, 'y'), point[0], point[1]);
  const length = Math.hypot(gx, gy);
  const rawAngle = (Math.atan2(gy, gx) * 180) / Math.PI;
  const gradAngle = rawAngle < 0 ? rawAngle + 360 : rawAngle;
  const gradSlope = directionalSlope(terms, point, toRadians(gradAngle), delta);
  if (Math.abs(gradSlope - length) > EQUAL_TOLERANCE) {
    throw new Error(
      `gradient-steepest: ∇f 방향의 기울기 ${gradSlope} 가 |∇f| ${length} 와 허용 오차 안에서 같지 않다`,
    );
  }

  let top = samples[0]!;
  for (const s of samples) {
    if (s.slope > top.slope) top = s;
  }
  let range = length;
  for (const s of samples) range = Math.max(range, Math.abs(s.slope));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { point: [point[0], point[1]], f: evaluate(terms, point[0], point[1]), angles, range },
  });

  // 걸음 0 은 점과 함숫값이 이미 서 있는 화면이라 읽을 틈을 둔다.
  for (let index = 0; index < samples.length; index += 1) {
    if (!(await pause())) return;
    const s = samples[index]!;
    await ctx.emit({ type: 'measure', payload: { index, angle: s.angle, slope: s.slope } });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'gradient',
    payload: {
      gx,
      gy,
      angle: gradAngle,
      length,
      slope: gradSlope,
      maxAngle: top.angle,
      maxSlope: top.slope,
      count: samples.length,
    },
  });
}
