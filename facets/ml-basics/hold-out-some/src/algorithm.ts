/**
 * hold-out-some — 맞추기 전에 몇을 떼어 두고, 나머지로만 직선을 맞춘 뒤, 두 쪽에서 따로 잰다.
 *
 * 자료: 점 (x, y) 열 개 · 섞은 차례(0 부터 센 자리의 열) · 떼어 둘 수. 섞은 차례의 앞쪽이 훈련,
 * 뒤쪽 `holdOut` 개가 떼어 둠이다. 알고리즘은 섞지 않고 적힌 차례를 읽는다.
 * 모형은 최소 제곱 직선 ŷ = a + b·x 하나이고 훈련 점으로만 맞춘다. 점수는 MSE = Σ(y − ŷ)² / n.
 *
 * 이벤트 (차례대로)
 *   init           silent  { range: { xMin: number; xMax: number; yMin: number; yMax: number } }
 *                          — 축 범위. 점과 맞춘 직선이 모두 들어가게 알고리즘이 셈한다
 *   split                  { train: number[]; held: number[] }
 *                          — 점의 자리(0 부터). 섞은 차례의 앞쪽 / 뒤쪽. 둘은 서로 겹치지 않는다
 *   fit                    { a: number; b: number; meanX: number; meanY: number }
 *                          — 훈련 점으로만 맞춘 직선과 그 점들의 평균 (직선은 평균점을 지난다)
 *   measure-train          { residuals: { index: number; residual: number }[]; mse: number }
 *                          — 훈련 점마다 벗어남 y − ŷ 와 그 MSE
 *   measure-held           { residuals: { index: number; residual: number }[]; mse: number }
 *                          — 같은 직선으로 떼어 둔 점마다 벗어남과 그 MSE
 *
 * 걸음: #0 점 열 · #1 떼어 냄 · #2 맞춤 · #3 훈련 쪽 잼 · #4 떼어 둔 쪽 잼 (걸음 다섯)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Point = { x: number; y: number };

export type HoldOutSomeFacetData = {
  type: 'hold-out-some';
  points: Point[];
  /** 섞은 차례 — 점의 자리(0 부터)를 늘어놓은 열. 0 … n−1 이 한 번씩 */
  order: number[];
  /** 섞은 차례의 뒤에서 떼어 둘 수 */
  holdOut: number;
  stepMs: number;
};

export type AxisRange = { xMin: number; xMax: number; yMin: number; yMax: number };
export type LineFit = { a: number; b: number; meanX: number; meanY: number };
export type Residual = { index: number; residual: number };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowHoldOutSome(raw: unknown): HoldOutSomeFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('hold-out-some: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'hold-out-some') throw new Error(`hold-out-some: type 이 다르다 (${String(r.type)})`);
  if (!Array.isArray(r.points)) throw new Error('hold-out-some: points 가 배열이 아니다');
  const points: Point[] = r.points.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) throw new Error(`hold-out-some: points[${i}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (!isFiniteNumber(q.x)) throw new Error(`hold-out-some: points[${i}].x 가 수가 아니다`);
    if (!isFiniteNumber(q.y)) throw new Error(`hold-out-some: points[${i}].y 가 수가 아니다`);
    return { x: q.x, y: q.y };
  });
  const n = points.length;
  if (!Array.isArray(r.order)) throw new Error('hold-out-some: order 가 배열이 아니다');
  if (r.order.length !== n) throw new Error(`hold-out-some: order 길이 ${r.order.length} 가 점 수 ${n} 와 다르다`);
  const seen = new Set<number>();
  const order: number[] = r.order.map((v: unknown, i: number) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n) {
      throw new Error(`hold-out-some: order[${i}] 가 점의 자리가 아니다 (${String(v)})`);
    }
    if (seen.has(v)) throw new Error(`hold-out-some: order[${i}] 가 겹친다 (${v})`);
    seen.add(v);
    return v;
  });
  const holdOut = r.holdOut;
  // 훈련에 둘은 남아야 직선이 하나로 정해진다
  if (typeof holdOut !== 'number' || !Number.isInteger(holdOut) || holdOut < 1 || holdOut > n - 2) {
    throw new Error(`hold-out-some: holdOut 이 1 … ${n - 2} 의 정수가 아니다 (${String(holdOut)})`);
  }
  if (!isFiniteNumber(r.stepMs) || r.stepMs <= 0) throw new Error('hold-out-some: stepMs 가 양수가 아니다');
  return { type: 'hold-out-some', points, order, holdOut, stepMs: r.stepMs };
}

/** 섞은 차례를 앞쪽(훈련)과 뒤쪽(떼어 둠)으로 가른다. */
export function splitOrder(data: HoldOutSomeFacetData): { train: number[]; held: number[] } {
  const cut = data.order.length - data.holdOut;
  return { train: data.order.slice(0, cut), held: data.order.slice(cut) };
}

/** 최소 제곱 직선 — 주어진 자리의 점으로만 맞춘다. */
export function fitLine(points: Point[], indices: number[]): LineFit {
  const n = indices.length;
  if (n < 2) throw new Error(`hold-out-some: 맞출 점이 둘보다 적다 (${n})`);
  const at = (i: number): Point => {
    const p = points[i];
    if (!p) throw new Error(`hold-out-some: 점 자리 ${i} 가 없다`);
    return p;
  };
  const meanX = indices.reduce((s, i) => s + at(i).x, 0) / n;
  const meanY = indices.reduce((s, i) => s + at(i).y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const i of indices) {
    const p = at(i);
    sxy += (p.x - meanX) * (p.y - meanY);
    sxx += (p.x - meanX) ** 2;
  }
  if (sxx === 0) throw new Error('hold-out-some: 훈련 점의 x 가 모두 같아 직선이 정해지지 않는다');
  const b = sxy / sxx;
  return { a: meanY - b * meanX, b, meanX, meanY };
}

/** 직선의 값 ŷ = a + b·x — 그림이 직선 끝점을 찍을 때도 이것을 부른다. */
export function lineAt(fit: { a: number; b: number }, x: number): number {
  return fit.a + fit.b * x;
}

/** 표시 — 두 자리(또는 주어진 자리)로 반올림하고 -0 을 0 으로, 빼기표는 − 로. */
export function formatValue(v: number, digits = 2): string {
  if (!Number.isFinite(v)) throw new Error(`hold-out-some: 표시할 값이 수가 아니다 (${v})`);
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** 축 범위 — 점과 직선의 두 끝이 모두 들어가게. x 는 반 칸씩 띄우고 y 는 정수로 넓힌다. */
function axisRange(points: Point[], fit: LineFit): AxisRange {
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs) - 0.5;
  const xMax = Math.max(...xs) + 0.5;
  const ys = [...points.map((p) => p.y), lineAt(fit, xMin), lineAt(fit, xMax)];
  return { xMin, xMax, yMin: Math.floor(Math.min(...ys)), yMax: Math.ceil(Math.max(...ys)) };
}

function measure(points: Point[], fit: LineFit, indices: number[]): { residuals: Residual[]; mse: number } {
  const residuals = indices.map((index) => {
    const p = points[index];
    if (!p) throw new Error(`hold-out-some: 점 자리 ${index} 가 없다`);
    return { index, residual: p.y - lineAt(fit, p.x) };
  });
  const mse = residuals.reduce((s, r) => s + r.residual ** 2, 0) / residuals.length;
  return { residuals, mse };
}

export async function holdOutSome(context: FacetContext<HoldOutSomeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<HoldOutSomeFacetData>;
  const data = narrowHoldOutSome(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { train, held } = splitOrder(data);
  const fit = fitLine(data.points, train);
  const onTrain = measure(data.points, fit, train);
  const onHeld = measure(data.points, fit, held);

  await ctx.emit({ type: 'init', payload: { range: axisRange(data.points, fit) }, silent: true });
  // 걸음 0 은 점 열이 이미 서 있는 화면이다 — 읽을 틈을 준다
  if (!(await pause())) return;

  await ctx.emit({ type: 'split', payload: { train, held } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'fit', payload: { a: fit.a, b: fit.b, meanX: fit.meanX, meanY: fit.meanY } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'measure-train', payload: onTrain });
  if (!(await pause())) return;

  await ctx.emit({ type: 'measure-held', payload: onHeld });
}
