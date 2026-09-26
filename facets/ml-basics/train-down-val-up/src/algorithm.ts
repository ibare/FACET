/**
 * train-down-val-up — 차수를 하나씩 올리며 훈련 오차와 검증 오차를 나란히 잰다.
 *
 * 차수 d 의 모형은 `c₀ + c₁x + … + c_d x^d`. 훈련 점만으로 최소 제곱 맞춤을 한다
 * (정규 방정식 `(XᵀX) c = Xᵀy` 를 부분 피벗 가우스 소거로). 검증 점은 맞춤에 닿지 않고
 * 오차를 잴 때만 쓴다. 오차는 MSE = Σ(y − ŷ)² / n.
 *
 * 이벤트
 *   init  (silent) — 걸음 0 을 세운다. 그림의 축 범위와 차수 0 의 맞춤을 함께 싣는다.
 *     payload: {
 *       range: { xMin: number; xMax: number; yMin: number; yMax: number; mseMax: number };
 *       fit: FitRecord;   // 차수 0
 *     }
 *   fit   — 차수 하나를 올려 다시 맞춘 결과. 차수 1 부터 maxDegree 까지 한 번씩.
 *     payload: FitRecord
 *
 *   FitRecord = { degree: number; coef: number[]; trainMse: number; valMse: number; lowDegree: number }
 *     coef 의 길이는 degree + 1, coef[k] 가 x^k 의 계수.
 *     lowDegree 는 차수 0 부터 이 차수까지에서 검증 MSE 가 가장 낮은 차수 (같으면 앞 차수).
 *
 * 셈은 전 정밀도로 한다. 표시 자리(두 자리)는 그림이 정한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = { x: number; y: number };

export type TrainDownValUpFacetData = {
  type: 'train-down-val-up';
  stepMs: number;
  /** 맞춤에 쓰는 점 */
  train: Pt[];
  /** 맞춤에 쓰지 않고 오차만 재는 점 */
  validation: Pt[];
  /** 올라갈 마지막 차수. 계수 수(maxDegree + 1)가 훈련 점 수보다 적어야 한다 */
  maxDegree: number;
};

export type FitRecord = { degree: number; coef: number[]; trainMse: number; valMse: number; lowDegree: number };

export type FitRange = { xMin: number; xMax: number; yMin: number; yMax: number; mseMax: number };

/** 곡선을 찍는 x 의 수 — 축 범위를 셈하는 자리와 그림이 같은 점을 쓴다 */
export const CURVE_SAMPLES = 97;

function readPoints(raw: unknown, path: string): Pt[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${path}: 점의 배열이어야 한다`);
  return raw.map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new Error(`${path}[${i}]: 점이 아니다`);
    const { x, y } = p as Record<string, unknown>;
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${path}[${i}].x: 수가 아니다`);
    if (typeof y !== 'number' || !Number.isFinite(y)) throw new Error(`${path}[${i}].y: 수가 아니다`);
    return { x, y };
  });
}

/** initialData 좁히개 — 알고리즘 · 장면 · 그림이 함께 부른다. 어긋나면 던진다 */
export function readTrainDownValUpData(raw: unknown): TrainDownValUpFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData: 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'train-down-val-up') throw new Error(`initialData.type: 'train-down-val-up' 이 아니다 (${String(r.type)})`);
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('initialData.stepMs: 양수여야 한다');
  const train = readPoints(r.train, 'initialData.train');
  const validation = readPoints(r.validation, 'initialData.validation');
  const maxDegree = r.maxDegree;
  if (typeof maxDegree !== 'number' || !Number.isInteger(maxDegree) || maxDegree < 1) {
    throw new Error('initialData.maxDegree: 1 이상의 정수여야 한다');
  }
  if (maxDegree + 1 >= train.length) {
    throw new Error(`initialData.maxDegree: 계수 ${maxDegree + 1} 이 훈련 점 ${train.length} 보다 적어야 한다`);
  }
  return { type: 'train-down-val-up', stepMs: r.stepMs, train, validation, maxDegree };
}

/** 다항식 값 — coef[k] 가 x^k 의 계수 (호너) */
export function evalPoly(coef: readonly number[], x: number): number {
  let v = 0;
  for (let k = coef.length - 1; k >= 0; k -= 1) v = v * x + coef[k]!;
  return v;
}

/** 곡선을 찍는 x 들 — xMin 에서 xMax 까지 고르게 */
export function curveXs(xMin: number, xMax: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i += 1) xs.push(xMin + ((xMax - xMin) * i) / (CURVE_SAMPLES - 1));
  return xs;
}

/** 부분 피벗 가우스 소거. 피벗이 0 이면 풀 수 없어 던진다 */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row) => row.slice());
  const v = b.slice();
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (m[p]![c] === 0) throw new Error(`정규 방정식: 열 ${c} 의 피벗이 0 이다 (풀 수 없다)`);
    [m[c], m[p]] = [m[p]!, m[c]!];
    [v[c], v[p]] = [v[p]!, v[c]!];
    for (let r = c + 1; r < n; r += 1) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < n; k += 1) m[r]![k]! -= f * m[c]![k]!;
      v[r]! -= f * v[c]!;
    }
  }
  const out = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = v[i]!;
    for (let k = i + 1; k < n; k += 1) s -= m[i]![k]! * out[k]!;
    out[i] = s / m[i]![i]!;
  }
  return out;
}

/** 차수 d 의 최소 제곱 계수 — 기저 1, x, …, x^d. x 는 적힌 그대로 */
function fitPoly(points: readonly Pt[], d: number): number[] {
  const rows = points.map((p) => {
    const row: number[] = [];
    for (let k = 0; k <= d; k += 1) row.push(p.x ** k);
    return row;
  });
  const ata: number[][] = [];
  const aty: number[] = [];
  for (let r = 0; r <= d; r += 1) {
    const line: number[] = [];
    for (let c = 0; c <= d; c += 1) {
      let s = 0;
      for (const row of rows) s += row[r]! * row[c]!;
      line.push(s);
    }
    ata.push(line);
    let s = 0;
    rows.forEach((row, i) => {
      s += row[r]! * points[i]!.y;
    });
    aty.push(s);
  }
  return solve(ata, aty);
}

function mse(coef: readonly number[], points: readonly Pt[]): number {
  let s = 0;
  for (const p of points) s += (p.y - evalPoly(coef, p.x)) ** 2;
  return s / points.length;
}

export async function trainDownValUp(context: FacetContext<TrainDownValUpFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TrainDownValUpFacetData>;
  const data = readTrainDownValUpData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 차수마다 훈련 점에 다시 맞춘다. 검증 점은 오차를 잴 때만 쓴다
  const fits: FitRecord[] = [];
  for (let d = 0; d <= data.maxDegree; d += 1) {
    if (ctx.cancelled) return;
    const coef = fitPoly(data.train, d);
    const valMse = mse(coef, data.validation);
    const before = fits[fits.length - 1];
    const lowDegree = before !== undefined && fits[before.lowDegree]!.valMse <= valMse ? before.lowDegree : d;
    fits.push({ degree: d, coef, trainMse: mse(coef, data.train), valMse, lowDegree });
  }

  // 그림의 축 범위 — 점과, 그림이 찍을 곡선의 값을 모두 담는다
  const all = [...data.train, ...data.validation];
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  let yMin = Math.min(...all.map((p) => p.y));
  let yMax = Math.max(...all.map((p) => p.y));
  const xs = curveXs(xMin, xMax);
  for (const f of fits) {
    for (const x of xs) {
      const y = evalPoly(f.coef, x);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  const mseMax = Math.max(...fits.map((f) => Math.max(f.trainMse, f.valMse)));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { range: { xMin, xMax, yMin, yMax, mseMax }, fit: fits[0] },
  });

  for (const f of fits.slice(1)) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'fit', payload: f });
  }
}
