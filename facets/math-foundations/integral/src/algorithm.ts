/**
 * integral — 미분과 적분: 쪼개어 다가간다.
 *
 * 곡선 f (항 목록) 위에서 두 셈을 같은 폭 h, 같은 잡는 자리로 한다.
 *   - 기울기: 점 a 의 할선 기울기 — 뒤 차분 · 앞 차분 · 가운데 차분
 *   - 넓이:  구간 [lo, hi] 의 리만 합 — 왼쪽 끝 · 오른쪽 끝 · 가운데 점
 * 참값은 거듭제곱 규칙으로만 셈한다 (참 기울기 = 도함수의 a 값, 참 넓이 = 되돌린 항의 hi 와 lo 의 차).
 * 추정(주장)은 차분과 합으로만 셈한다 — 도함수로 셈하면 셈이 순환한다.
 *
 * 함숫값 차례 (IR 과 같다): 항마다 계수를 double 로 두고 x 를 지수 번 곱해 더한다. `Math.pow` · `**` 를 쓰지 않는다.
 * x³ 와 2 진 폭에서는 모든 중간값이 2 진 분수라 정확하다 — 여섯 언어가 같은 답을 낸다.
 *
 * ── 손잡이 (reactive) ──
 *   rule  (0 왼쪽 · 1 오른쪽 · 2 가운데) — `ruleLadder` 소속만 받는다
 *   width (h)                            — `widthLadder` 소속만 받는다. 사다리는 한 칸마다 반으로 준다
 *   제 type 인데 값이 사다리 밖이면 던진다. 모르는 type 은 흘린다.
 *
 * ── 이벤트 ── (한 판 다섯 걸음. 걸음 이벤트는 silent 가 아니다)
 *   init    (silent) { rule, h, n, a, fa, lo, hi, terms: number[] (평평한 [계수, 지수, …]),
 *                      axis: { xMin, xMax, yMin, yMax, xTicks: number[], yTicks: number[] },
 *                      curveX: number[], curveY: number[] }                          — 곡선 표본 (무대는 f 를 셈하지 않는다)
 *   secant  { rule, h, p: {x, y}, q: {x, y}, line: {x0, y0, x1, y1}, tangent: {x0, y0, x1, y1},
 *             estimate, error, trueSlope }                                          — 할선 두 끝 · 축 끝까지 늘인 할선 · 참 기울기의 접선
 *   strips  { rule, n, w, x0s: number[], sx: number[], sy: number[] }                 — 조각 틀 (왼 끝 · 폭) · 재는 점 · 높이
 *   sum     { n, partials: number[], estimate, error, trueArea }                      — partials[k] = 조각 0..k 의 합
 *   compare { h, h2: number | null, slopeError, areaError, slopeError2: number | null, areaError2: number | null,
 *             slopeRatio: number | null, areaRatio: number | null, barMax }             — 폭 h 와 사다리 한 칸 위 2h 의 오차 · 비
 *                                                                                      (h 가 사다리 첫 칸이면 2h 쪽은 null)
 *   phase   (silent) { phase }
 *
 * ── phase 어휘 (irs.ts 와 같다) ──
 *   slope-left · slope-right · slope-mid · area-left · area-right · area-mid · area-add
 *   걸음 1 앞 slope-<자리>, 걸음 2 앞 area-<자리>, 걸음 3 앞 area-add. 걸음 4 는 새 phase 없음.
 *
 * ── 계기 ──
 *   strip-count  조각 수 n              — 판 머리 0, 걸음 2 에서 n
 *   curve-evals  f 를 부른 수 (2 + n)   — 판 머리 0, 걸음 1 에서 2, 걸음 3 에서 2 + n (폭 2h 의 셈은 넣지 않는다)
 *
 * 동률 규칙: 견주기가 없다 (비는 두 오차의 몫일 뿐 판정하지 않는다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IntegralData = {
  type: 'integral';
  stepMs: number;
  terms: number[][];
  a: number;
  lo: number;
  hi: number;
  ruleLadder: number[];
  rule: number;
  widthLadder: number[];
  width: number;
};

/** 걸음 사이 운동 길이 (재생 속도 1 에서). 무대가 속도로 나눈다. */
export const MOTION_MS = 800;

/** 곡선 표본 칸 수 — 그림용, 계기에 넣지 않는다. */
const CURVE_SAMPLES = 256;

/** f 를 부른 수를 세는 통. */
export type CallCounter = { calls: number };

/** 항 목록을 IR 에 건넬 평평한 정수 배열로 편다. */
export function flattenTerms(terms: number[][]): number[] {
  const out: number[] = [];
  for (const term of terms) {
    const [c, p] = term;
    if (term.length !== 2 || c === undefined || p === undefined) throw new Error('integral: 항은 [계수, 지수] 둘이다');
    if (!Number.isInteger(c) || !Number.isInteger(p) || p < 0) throw new Error('integral: 계수는 정수, 지수는 음이 아닌 정수다');
    out.push(c, p);
  }
  return out;
}

/** 함숫값 — 항마다 계수를 double 로 두고 x 를 지수 번 곱해 더한다 (IR 의 fAt 과 같은 차례). */
export function fAt(terms: number[], x: number, counter?: CallCounter): number {
  if (terms.length % 2 !== 0) throw new Error('integral: 평평한 항 목록의 길이는 짝수다');
  if (counter) counter.calls += 1;
  let total = 0.0;
  for (let i = 0; i < terms.length / 2; i += 1) {
    const coef = terms[2 * i];
    const power = terms[2 * i + 1];
    if (coef === undefined || power === undefined) throw new Error('integral: 항 목록이 비었다');
    let term = coef;
    for (let j = 0; j < power; j += 1) term = term * x;
    total = total + term;
  }
  return total;
}

/** 할선 기울기 — 0 뒤 차분 · 1 앞 차분 · 2 가운데 차분. 모르는 자리는 던진다 (IR 은 −1 표지). */
export function slope(terms: number[], rule: number, a: number, h: number, counter?: CallCounter): number {
  if (rule === 0) return (fAt(terms, a, counter) - fAt(terms, a - h, counter)) / h;
  if (rule === 1) return (fAt(terms, a + h, counter) - fAt(terms, a, counter)) / h;
  if (rule === 2) return (fAt(terms, a + h, counter) - fAt(terms, a - h, counter)) / (2 * h);
  throw new Error(`integral: 모르는 잡는 자리 ${rule}`);
}

/** 잡는 자리 → 조각 안에서 높이를 재는 자리 (0 왼 끝 · 1 오른 끝 · 0.5 가운데). */
function offsetOf(rule: number): number {
  if (rule === 0) return 0.0;
  if (rule === 1) return 1.0;
  if (rule === 2) return 0.5;
  throw new Error(`integral: 모르는 잡는 자리 ${rule}`);
}

export type AreaDetail = {
  w: number;
  x0s: number[];
  sx: number[];
  sy: number[];
  partials: number[];
  total: number;
};

/** 리만 합과 그 조각들 — IR 의 area 와 같은 차례 (`w = (hi − lo) / n` · `lo + (k + off) * w`). */
export function areaDetail(terms: number[], rule: number, lo: number, hi: number, n: number, counter?: CallCounter): AreaDetail {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`integral: 조각 수는 양의 정수다 (${n})`);
  const w = (hi - lo) / n;
  const off = offsetOf(rule);
  const x0s: number[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  const partials: number[] = [];
  let total = 0.0;
  for (let k = 0; k < n; k += 1) {
    const x = lo + (k + off) * w;
    const y = fAt(terms, x, counter);
    total = total + y * w;
    x0s.push(lo + k * w);
    sx.push(x);
    sy.push(y);
    partials.push(total);
  }
  return { w, x0s, sx, sy, partials, total };
}

export function area(terms: number[], rule: number, lo: number, hi: number, n: number, counter?: CallCounter): number {
  return areaDetail(terms, rule, lo, hi, n, counter).total;
}

/** 참 기울기 — 거듭제곱 규칙으로 미분한 항의 a 값 (추정에는 쓰지 않는다). */
export function trueSlopeOf(terms: number[], a: number): number {
  const d: number[] = [];
  for (let i = 0; i < terms.length; i += 2) {
    const c = terms[i];
    const p = terms[i + 1];
    if (c === undefined || p === undefined) throw new Error('integral: 항 목록이 비었다');
    if (p > 0) d.push(c * p, p - 1);
  }
  return fAt(d, a);
}

/** 참 넓이 — 거듭제곱 규칙으로 되돌린 항(x^p → x^(p+1)/(p+1))의 hi 와 lo 의 차 (기본 정리). */
export function trueAreaOf(terms: number[], lo: number, hi: number): number {
  const anti: number[] = [];
  for (let i = 0; i < terms.length; i += 2) {
    const c = terms[i];
    const p = terms[i + 1];
    if (c === undefined || p === undefined) throw new Error('integral: 항 목록이 비었다');
    anti.push(c / (p + 1), p + 1);
  }
  return fAt(anti, hi) - fAt(anti, lo);
}

/** 눈금 간격 — 범위를 다섯 칸 안팎으로 나누는 1 · 2 · 5 계열의 가장 작은 값. */
function tickStep(span: number): number {
  const raw = span / 5;
  let base = 1;
  while (base * 10 <= raw) base *= 10;
  while (base > raw) base /= 10;
  for (const m of [1, 2, 5, 10]) if (base * m >= raw) return base * m;
  throw new Error('integral: 눈금 간격을 정하지 못했다');
}

function ticksOf(min: number, max: number): number[] {
  const step = tickStep(max - min);
  const out: number[] = [];
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  for (let i = first; i <= last; i += 1) out.push(i * step);
  return out;
}

export type Round = {
  rule: number;
  h: number;
  n: number;
  h2: number | null;
  slopeEstimate: number;
  slopeError: number;
  areaEstimate: number;
  areaError: number;
  slopeError2: number | null;
  areaError2: number | null;
  slopeRatio: number | null;
  areaRatio: number | null;
  evals: number;
  detail: AreaDetail;
  trueSlope: number;
  trueArea: number;
};

/** 한 판의 셈 전부 — 화면의 수는 여기서 나온다. */
export function computeRound(data: IntegralData, rule: number, h: number): Round {
  const terms = flattenTerms(data.terms);
  const idx = data.widthLadder.indexOf(h);
  if (idx < 0) throw new Error(`integral: 폭 ${h} 는 사다리 밖이다`);
  const nRaw = (data.hi - data.lo) / h;
  if (!Number.isInteger(nRaw)) throw new Error(`integral: 폭 ${h} 로 구간이 나누어떨어지지 않는다`);
  const n = nRaw;
  const counter: CallCounter = { calls: 0 };
  const slopeEstimate = slope(terms, rule, data.a, h, counter);
  const detail = areaDetail(terms, rule, data.lo, data.hi, n, counter);
  const trueSlope = trueSlopeOf(terms, data.a);
  const trueArea = trueAreaOf(terms, data.lo, data.hi);
  const slopeError = slopeEstimate - trueSlope;
  const areaError = detail.total - trueArea;
  let h2: number | null = null;
  let slopeError2: number | null = null;
  let areaError2: number | null = null;
  let slopeRatio: number | null = null;
  let areaRatio: number | null = null;
  if (idx > 0) {
    const up = data.widthLadder[idx - 1];
    if (up === undefined || up !== 2 * h) throw new Error('integral: 폭 사다리는 한 칸마다 반으로 준다');
    h2 = up;
    // 폭 2h 의 두 추정 — 같은 slope · area 로 한 번 더 (계기에는 넣지 않는다)
    slopeError2 = slope(terms, rule, data.a, up) - trueSlope;
    areaError2 = area(terms, rule, data.lo, data.hi, n / 2) - trueArea;
    if (slopeError2 === 0 || areaError2 === 0) throw new Error('integral: 폭 2h 의 오차가 0 이라 비를 셈할 수 없다');
    slopeRatio = slopeError / slopeError2;
    areaRatio = areaError / areaError2;
  }
  return {
    rule, h, n, h2, slopeEstimate, slopeError, areaEstimate: detail.total, areaError,
    slopeError2, areaError2, slopeRatio, areaRatio, evals: counter.calls, detail, trueSlope, trueArea,
  };
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다. */
export function readData(raw: unknown): IntegralData {
  if (typeof raw !== 'object' || raw === null) throw new Error('integral: data 가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'integral') throw new Error('integral: data.type 이 integral 이 아니다');
  const nums = ['stepMs', 'a', 'lo', 'hi', 'rule', 'width'] as const;
  for (const k of nums) if (typeof d[k] !== 'number') throw new Error(`integral: data.${k} 는 수다`);
  const terms = d.terms;
  if (!Array.isArray(terms) || terms.length === 0 || !terms.every(isNumberArray)) throw new Error('integral: data.terms 는 [계수, 지수] 목록이다');
  if (!isNumberArray(d.ruleLadder) || !isNumberArray(d.widthLadder)) throw new Error('integral: 사다리는 수 목록이다');
  const data: IntegralData = {
    type: 'integral',
    stepMs: d.stepMs as number,
    terms: terms as number[][],
    a: d.a as number,
    lo: d.lo as number,
    hi: d.hi as number,
    ruleLadder: d.ruleLadder,
    rule: d.rule as number,
    widthLadder: d.widthLadder,
    width: d.width as number,
  };
  if (!(data.hi > data.lo)) throw new Error('integral: 구간은 lo < hi');
  if (!data.ruleLadder.includes(data.rule)) throw new Error('integral: 처음 잡는 자리가 사다리 밖이다');
  if (!data.widthLadder.includes(data.width)) throw new Error('integral: 처음 폭이 사다리 밖이다');
  flattenTerms(data.terms);
  return data;
}

/** 축 범위와 곡선 표본 — 판마다 같다 (할선 끝이 닿는 자리까지 넣는다). */
function backdrop(data: IntegralData, terms: number[]) {
  const hMax = Math.max(...data.widthLadder);
  const xMin = Math.min(data.lo, data.a - hMax);
  const xMax = Math.max(data.hi, data.a + hMax);
  const curveX: number[] = [];
  const curveY: number[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / CURVE_SAMPLES;
    curveX.push(x);
    curveY.push(fAt(terms, x));
  }
  const yMin = Math.min(0, ...curveY);
  const yMax = Math.max(0, ...curveY);
  return {
    axis: { xMin, xMax, yMin, yMax, xTicks: ticksOf(xMin, xMax), yTicks: ticksOf(yMin, yMax) },
    curveX,
    curveY,
  };
}

/** 두 점을 지나는 직선을 축 끝(xMin · xMax)까지 늘인 두 끝. */
function lineAcross(x0: number, y0: number, s: number, xMin: number, xMax: number) {
  return { x0: xMin, y0: y0 + s * (xMin - x0), x1: xMax, y1: y0 + s * (xMax - x0) };
}

export async function integralAlgorithm(ctx: FacetContext<IntegralData>): Promise<void> {
  const rctx = ctx as ReactiveContext<IntegralData>;
  const data = readData(ctx.data);
  const terms = flattenTerms(data.terms);
  const back = backdrop(data, terms);
  const { xMin, xMax } = back.axis;
  const fa = fAt(terms, data.a);

  // 지금 보이는 계기 값 — 차이만 보낸다 (처음 한 번은 차이 0 이어도 보낸다)
  const shown = new Map<string, number>([
    ['strip-count', 0],
    ['curve-evals', 0],
  ]);
  const setMeter = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined) throw new Error(`integral: 선언하지 않은 계기 ${name}`);
    ctx.metric(name, value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rctx.sleep(data.stepMs + MOTION_MS);

  let rule = data.rule;
  let width = data.width;

  try {
    while (true) {
      if (ctx.cancelled) return;
      const r = computeRound(data, rule, width);
      setMeter('strip-count', 0);
      setMeter('curve-evals', 0);

      // 걸음 0 — 판 머리
      await ctx.emit({
        type: 'init',
        payload: {
          rule, h: width, n: r.n, a: data.a, fa, lo: data.lo, hi: data.hi, terms,
          axis: back.axis, curveX: back.curveX, curveY: back.curveY,
        },
        silent: true,
      });
      if (!(await pause())) return;

      // 걸음 1 — 할선
      if (rule === 0) await phase('slope-left');
      else if (rule === 1) await phase('slope-right');
      else if (rule === 2) await phase('slope-mid');
      else throw new Error(`integral: 모르는 잡는 자리 ${rule}`);
      setMeter('curve-evals', 2);
      const px = rule === 1 ? data.a : data.a - width;
      const qx = rule === 0 ? data.a : data.a + width;
      await ctx.emit({
        type: 'secant',
        payload: {
          rule, h: width,
          p: { x: px, y: fAt(terms, px) },
          q: { x: qx, y: fAt(terms, qx) },
          line: lineAcross(px, fAt(terms, px), r.slopeEstimate, xMin, xMax),
          tangent: lineAcross(data.a, fa, r.trueSlope, xMin, xMax),
          estimate: r.slopeEstimate, error: r.slopeError, trueSlope: r.trueSlope,
        },
      });
      if (!(await pause())) return;

      // 걸음 2 — 조각 틀과 재는 점
      if (rule === 0) await phase('area-left');
      else if (rule === 1) await phase('area-right');
      else await phase('area-mid');
      setMeter('strip-count', r.n);
      await ctx.emit({
        type: 'strips',
        payload: { rule, n: r.n, w: r.detail.w, x0s: r.detail.x0s, sx: r.detail.sx, sy: r.detail.sy },
      });
      if (!(await pause())) return;

      // 걸음 3 — 조각을 쌓은 합
      await phase('area-add');
      setMeter('curve-evals', r.evals);
      await ctx.emit({
        type: 'sum',
        payload: { n: r.n, partials: r.detail.partials, estimate: r.areaEstimate, error: r.areaError, trueArea: r.trueArea },
      });
      if (!(await pause())) return;

      // 걸음 4 — 폭 2h 와 폭 h 의 오차 견주기
      const mags = [r.slopeError, r.areaError];
      if (r.slopeError2 !== null && r.areaError2 !== null) mags.push(r.slopeError2, r.areaError2);
      await ctx.emit({
        type: 'compare',
        payload: {
          h: width, h2: r.h2,
          slopeError: r.slopeError, areaError: r.areaError,
          slopeError2: r.slopeError2, areaError2: r.areaError2,
          slopeRatio: r.slopeRatio, areaRatio: r.areaRatio,
          barMax: Math.max(...mags.map(Math.abs)),
        },
      });

      // 손잡이 대기
      let got = false;
      while (!got) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (input.type === 'rule') {
          if (typeof value !== 'number' || !data.ruleLadder.includes(value)) throw new Error(`integral: 잡는 자리 값이 사다리 밖이다 (${String(value)})`);
          rule = value;
          got = true;
        } else if (input.type === 'width') {
          if (typeof value !== 'number' || !data.widthLadder.includes(value)) throw new Error(`integral: 폭 값이 사다리 밖이다 (${String(value)})`);
          width = value;
          got = true;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
