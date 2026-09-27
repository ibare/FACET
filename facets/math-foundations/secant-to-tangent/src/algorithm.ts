/**
 * secant-to-tangent — 둘째 점이 곡선을 따라 첫째 점으로 미끄러져 오고, 두 점을 잇는
 * 할선이 첫째 점을 축으로 돌아 누우며 그 기울기가 한 값에 다가간다.
 *
 * 함수는 항 목록 `[[계수, 지수], …]` 로 받는다. 할선 기울기는 (f(a + h) − f(a)) / h,
 * 접선 기울기 f′(a) 는 항 목록을 거듭제곱 규칙으로 미분해 셈한다 (극한을 수로 셈하지 않는다).
 *
 * 이벤트 (발신 차례대로)
 *
 * - `init` (silent) — 바탕. 걸음 0 을 채운다
 *   payload: {
 *     terms: [number, number][]           곡선의 항 목록 (글자 찍개용 사본)
 *     a: number                           첫째 점의 x
 *     fa: number                          f(a)
 *     tangent: number                     접선 기울기 f′(a) — 거듭제곱 규칙
 *     curve: { x: number; y: number }[]   곡선을 그릴 표본점 (정의역 [0, 가장 큰 a + h])
 *     xMax: number; yMax: number          표본점의 가장 큰 좌표
 *     slopeLo: number; slopeHi: number    할선 · 접선 기울기의 가장 작은 값 · 가장 큰 값
 *   }
 *
 * - `secant` — 걸음 하나 = h 하나. 둘째 점을 a + h 에 두고 할선을 긋는다
 *   payload: {
 *     h: number                           이번 거리 (데이터 그대로)
 *     qx: number; qy: number              둘째 점 (a + h, f(a + h))
 *     slope: number                       할선 기울기
 *     gap: number                         할선 기울기 − 접선 기울기
 *     path: { x: number; y: number; slope: number }[]
 *                                         둘째 점이 지나는 자리와 그때의 할선 기울기.
 *                                         첫 걸음은 도착점 하나, 이후는 앞 자리에서 이번 자리까지
 *   }
 *
 * - `tangent` — 마지막 걸음. 둘째 점이 첫째 점에 겹치고 할선이 접선이 된다
 *   payload: {
 *     slope: number                       접선 기울기 f′(a)
 *     path: { x: number; y: number; slope: number }[]
 *                                         마지막 둘째 점에서 첫째 점까지. 끝 표본은 (a, f(a), f′(a))
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Term = [number, number];

export type SecantToTangentFacetData = {
  type: 'secant-to-tangent';
  terms: Term[];
  a: number;
  hs: number[];
  stepMs: number;
};

export type PathSample = { x: number; y: number; slope: number };

/** 곡선 표본점의 수 — 셈의 도구 */
const CURVE_SAMPLES = 81;
/** 둘째 점이 한 걸음에 지나는 자리의 수 */
const PATH_SAMPLES = 24;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** `ctx.data` · 장면 `initial` 이 함께 쓰는 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowSecantToTangentData(raw: unknown): SecantToTangentFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('secant-to-tangent: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'secant-to-tangent') {
    throw new Error(`secant-to-tangent: initialData.type 이 'secant-to-tangent' 가 아니다 (${String(d.type)})`);
  }
  if (!Array.isArray(d.terms) || d.terms.length === 0) {
    throw new Error('secant-to-tangent: initialData.terms 가 비었거나 배열이 아니다');
  }
  const terms: Term[] = d.terms.map((term, i) => {
    if (!Array.isArray(term) || term.length !== 2 || !isFiniteNumber(term[0]) || !isFiniteNumber(term[1])) {
      throw new Error(`secant-to-tangent: initialData.terms[${i}] 가 [계수, 지수] 가 아니다`);
    }
    return [term[0], term[1]];
  });
  if (!isFiniteNumber(d.a)) throw new Error('secant-to-tangent: initialData.a 가 수가 아니다');
  if (!Array.isArray(d.hs) || d.hs.length === 0) {
    throw new Error('secant-to-tangent: initialData.hs 가 비었거나 배열이 아니다');
  }
  const hs = d.hs.map((h, i) => {
    if (!isFiniteNumber(h) || h <= 0) {
      throw new Error(`secant-to-tangent: initialData.hs[${i}] 가 양수가 아니다`);
    }
    return h;
  });
  for (let i = 1; i < hs.length; i += 1) {
    if (hs[i] >= hs[i - 1]) {
      throw new Error(`secant-to-tangent: initialData.hs[${i}] 가 앞보다 작지 않다 — 둘째 점은 다가오기만 한다`);
    }
  }
  if (!isFiniteNumber(d.stepMs) || d.stepMs < 0) {
    throw new Error('secant-to-tangent: initialData.stepMs 가 0 이상의 수가 아니다');
  }
  return { type: 'secant-to-tangent', terms, a: d.a, hs, stepMs: d.stepMs };
}

/** f(x) = Σ 계수 · x^지수 */
export function evalTerms(terms: readonly Term[], x: number): number {
  let sum = 0;
  for (const [c, p] of terms) sum += c * x ** p;
  return sum;
}

/** 거듭제곱 규칙 — 계수 × 지수, 지수 − 1. 지수 0 인 항은 사라진다 */
export function differentiate(terms: readonly Term[]): Term[] {
  const out: Term[] = [];
  for (const [c, p] of terms) {
    if (p === 0) continue;
    out.push([c * p, p - 1]);
  }
  return out;
}

/** 할선 기울기 (f(x) − f(a)) / (x − a) */
function secantSlope(terms: readonly Term[], a: number, x: number): number {
  return (evalTerms(terms, x) - evalTerms(terms, a)) / (x - a);
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** 항 목록을 식 글자로 — `[[1, 2]]` → `x²`. 무대가 곡선 이름에 쓴다 */
export function formatTerms(terms: readonly Term[]): string {
  const parts: string[] = [];
  terms.forEach(([c, p], i) => {
    if (!Number.isInteger(p) || p < 0) {
      throw new Error(`secant-to-tangent: 지수 ${p} 는 글자로 찍을 수 없다 (terms[${i}])`);
    }
    const neg = c < 0;
    const mag = Math.abs(c);
    const power = p === 0 ? '' : p === 1 ? 'x' : `x${[...String(p)].map((ch) => SUPERSCRIPT[ch]).join('')}`;
    const coef = p !== 0 && mag === 1 ? '' : String(mag);
    const body = `${coef}${power}`;
    if (i === 0) parts.push(neg ? `−${body}` : body);
    else parts.push(neg ? ` − ${body}` : ` + ${body}`);
  });
  return parts.join('');
}

function pathBetween(terms: readonly Term[], a: number, from: number, to: number): PathSample[] {
  const out: PathSample[] = [];
  for (let i = 0; i <= PATH_SAMPLES; i += 1) {
    const x = from + ((to - from) * i) / PATH_SAMPLES;
    out.push({ x, y: evalTerms(terms, x), slope: secantSlope(terms, a, x) });
  }
  return out;
}

export async function secantToTangent(ctx: FacetContext<SecantToTangentFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SecantToTangentFacetData>;
  const { terms, a, hs, stepMs } = narrowSecantToTangentData(ctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const fa = evalTerms(terms, a);
  const tangent = evalTerms(differentiate(terms), a);
  const xMax = a + hs[0];
  const curve: { x: number; y: number }[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i += 1) {
    const x = (xMax * i) / (CURVE_SAMPLES - 1);
    curve.push({ x, y: evalTerms(terms, x) });
  }
  const yMax = Math.max(...curve.map((p) => p.y));
  const slopes = [...hs.map((h) => secantSlope(terms, a, a + h)), tangent];

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      terms: terms.map(([c, p]) => [c, p]),
      a,
      fa,
      tangent,
      curve,
      xMax,
      yMax,
      slopeLo: Math.min(...slopes),
      slopeHi: Math.max(...slopes),
    },
  });

  // 걸음 0 은 곡선과 첫째 점 — 읽을 것이 있는 화면이라 첫 발신 앞에 한 박자를 둔다
  let prevX: number | null = null;
  for (const h of hs) {
    if (!(await pause())) return;
    const qx = a + h;
    const qy = evalTerms(terms, qx);
    const slope = secantSlope(terms, a, qx);
    const path: PathSample[] = prevX === null ? [{ x: qx, y: qy, slope }] : pathBetween(terms, a, prevX, qx);
    await ctx.emit({
      type: 'secant',
      payload: { h, qx, qy, slope, gap: slope - tangent, path },
    });
    prevX = qx;
  }

  if (!(await pause())) return;
  if (prevX === null) throw new Error('secant-to-tangent: 둘째 점이 한 번도 놓이지 않았다');
  // 마지막 자리에서 첫째 점까지 — 끝 표본만 두 점이 겹친 자리라 접선 기울기를 싣는다
  const approach = pathBetween(terms, a, prevX, a).slice(0, -1);
  const path: PathSample[] = [...approach, { x: a, y: fa, slope: tangent }];
  await ctx.emit({ type: 'tangent', payload: { slope: tangent, path } });
}
