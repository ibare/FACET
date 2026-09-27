/**
 * mean-and-spread — 평균은 값들이 맞서 균형을 이루는 받침 자리이고, 분산은 편차가 제곱으로 부푼 것의 평균이다.
 *
 * 값 여덟(이 차례로)을 받아 평균 · 편차 · 제곱 · 분산 · 표준편차를 셈해 걸음마다 한 가지씩 내보낸다.
 * 분산의 분모는 n (가진 값 전부를 모집단으로 본다).
 *
 * 이벤트 (모두 await, type 은 리터럴)
 *   init       silent: true
 *              { lo: number; hi: number; maxSide: number }
 *              — 수의 줄이 담아야 하는 범위(값 · 편차 사슬의 끝을 모두 담는 정수 경계)와 가장 큰 편차의 크기.
 *                걸음 0(값 여덟) 의 바탕을 갈아 끼운다.
 *   mean       { sum: number; n: number; mean: number }
 *   deviations { dev: number[]; from: number[]; to: number[]; left: number; right: number; total: number }
 *              — dev[i] = 값[i] − 평균. from[i] .. to[i] 는 편차 i 가 사슬에서 차지하는 구간(값의 단위).
 *                음의 편차는 평균에서 왼쪽으로, 양의 편차는 오른쪽으로 가까운 것부터 잇는다. 0 은 from = to = 평균.
 *                left = 음의 편차의 합, right = 양의 편차의 합, total = 전체 합
 *   squares    { sq: number[]; ss: number; far: number }
 *              — sq[i] = dev[i]², ss = 합, far = |편차| 가 가장 큰 값의 자리(같으면 앞의 것)
 *   variance   { ss: number; n: number; variance: number; side: number }
 *              — variance = ss / n, side = √variance (넓이가 분산인 정사각형의 한 변)
 *   spread     { variance: number; sd: number; bandLo: number; bandHi: number; inside: number[] }
 *              — sd = √variance, bandLo .. bandHi = 평균 ± sd, inside = 그 구간 안에 드는 값의 자리
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MeanAndSpreadFacetData = {
  type: 'mean-and-spread';
  values: number[];
  stepMs: number;
};

/** ctx.data · initialData 의 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowMeanAndSpreadData(raw: unknown): MeanAndSpreadFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('mean-and-spread: data 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'mean-and-spread') {
    throw new Error(`mean-and-spread: data.type 이 'mean-and-spread' 가 아니다 (${String(r.type)})`);
  }
  const values = r.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('mean-and-spread: data.values 는 비지 않은 배열이어야 한다');
  }
  const out: number[] = [];
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`mean-and-spread: data.values[${i}] 가 유한한 수가 아니다`);
    }
    out.push(v);
  });
  const stepMs = r.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('mean-and-spread: data.stepMs 는 양의 수여야 한다');
  }
  return { type: 'mean-and-spread', values: out, stepMs };
}

/** 부동소수 끝자리를 걷는다 — 10⁻⁹ 아래 흔들림은 0 으로. */
function clean(x: number): number {
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * 화면의 수 글자. 정수로 떨어지면 정수, 아니면 소수 둘째 자리. 음수는 빼기 기호(U+2212).
 * 장면 · 그림이 같은 글자를 쓰도록 여기 둔다.
 */
export function formatNumber(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`mean-and-spread: 유한하지 않은 수 ${String(x)}`);
  const c = clean(x);
  const body = Number.isInteger(c) ? String(Math.abs(c)) : Math.abs(c).toFixed(2);
  return c < 0 ? `−${body}` : body;
}

export async function meanAndSpread(context: FacetContext<MeanAndSpreadFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<MeanAndSpreadFacetData>;
  const { values, stepMs } = narrowMeanAndSpreadData(ctx.data);
  const n = values.length;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // ── 셈 ──
  let sum = 0;
  for (const v of values) sum += v;
  sum = clean(sum);
  const mean = clean(sum / n);

  const dev = values.map((v) => clean(v - mean));
  const from: number[] = dev.map(() => mean);
  const to: number[] = dev.map(() => mean);

  const leftIdx = dev
    .map((d, i) => ({ d, i }))
    .filter((e) => e.d < 0)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d) || b.i - a.i);
  const rightIdx = dev
    .map((d, i) => ({ d, i }))
    .filter((e) => e.d > 0)
    .sort((a, b) => a.d - b.d || a.i - b.i);

  let cursor = mean;
  for (const e of leftIdx) {
    to[e.i] = clean(cursor);
    cursor = clean(cursor + e.d);
    from[e.i] = cursor;
  }
  const leftEnd = cursor;
  cursor = mean;
  for (const e of rightIdx) {
    from[e.i] = clean(cursor);
    cursor = clean(cursor + e.d);
    to[e.i] = cursor;
  }
  const rightEnd = cursor;

  let left = 0;
  let right = 0;
  for (const d of dev) {
    if (d < 0) left += d;
    else right += d;
  }
  left = clean(left);
  right = clean(right);
  const total = clean(left + right);

  let maxSide = 0;
  let far = 0;
  dev.forEach((d, i) => {
    if (Math.abs(d) > maxSide) {
      maxSide = Math.abs(d);
      far = i;
    }
  });

  const lo = Math.floor(Math.min(...values, leftEnd)) - 1;
  const hi = Math.ceil(Math.max(...values, rightEnd)) + 1;

  const sq = dev.map((d) => clean(d * d));
  let ss = 0;
  for (const s of sq) ss += s;
  ss = clean(ss);
  const variance = clean(ss / n);
  const sd = clean(Math.sqrt(variance));
  const bandLo = clean(mean - sd);
  const bandHi = clean(mean + sd);
  const inside: number[] = [];
  values.forEach((v, i) => {
    if (v >= bandLo - 1e-9 && v <= bandHi + 1e-9) inside.push(i);
  });

  // ── 걸음 ──
  // 걸음 0 은 값 여덟이 이미 선 화면이라, 첫 발신 앞에 읽을 틈을 둔다.
  await ctx.emit({ type: 'init', silent: true, payload: { lo, hi, maxSide } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'mean', payload: { sum, n, mean } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'deviations', payload: { dev, from, to, left, right, total } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'squares', payload: { sq, ss, far } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'variance', payload: { ss, n, variance, side: sd } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'spread', payload: { variance, sd, bandLo, bandHi, inside } });
}
