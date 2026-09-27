/**
 * partial-slice — 입력이 둘인 함수에서 한 입력을 붙들면 한 줄기의 곡선이 떨어져 나오고,
 * 그 곡선의 기울기가 편도함수다.
 *
 * 함수는 두 변수 항 목록 `[[계수, x 지수, y 지수], …]` 로 받는다. "y 를 b 로 붙든다" 는
 * 항마다 y^py 를 b^py 로 바꿔 x 한 변수의 항 목록 `[[계수, 지수], …]` 을 만드는 것이다
 * (x 쪽도 같다). 단면의 기울기는 그 한 변수 항 목록을 거듭제곱 규칙으로 미분해 점에서 셈하고,
 * 두 변수 항 목록에서 곧바로 셈한 편도함수와 같은지 대조한다 — 다르면 던진다.
 *
 * 이벤트 (발신 순서대로):
 *
 *   init   silent: true — 걸음 0 을 갈아 끼운다
 *     payload: {
 *       formula: string            두 변수 함수의 식 글자 ('f(x, y) = x²y')
 *       f: number                  점에서의 함숫값
 *       grid: {
 *         xs: number[]             바탕 격자의 x 자리 (domain.x 를 gridStep 으로 나눈 것)
 *         ys: number[]             바탕 격자의 y 자리
 *         values: number[][]       values[j][i] = f(xs[i], ys[j])
 *         max: number              values 가운데 가장 큰 것
 *       }
 *       frames: Array<{            자르는 차례대로, 단면 그림의 틀
 *         free: 'x' | 'y'          남는 입력
 *         held: 'x' | 'y'          붙드는 입력
 *         at: number               붙드는 값 (점의 그 좌표)
 *         lo: number, hi: number   남는 입력의 구간 (domain 에서)
 *         max: number              그 구간에서 단면 표본의 가장 큰 값
 *       }>
 *     }
 *
 *   slice  걸음 — 한 입력을 붙들어 단면 한 줄기가 떨어져 나온다
 *     payload: {
 *       free: 'x' | 'y', held: 'x' | 'y', at: number
 *       terms: Array<[number, number]>   단면의 한 변수 항 목록
 *       formula: string                  단면의 식 글자 ('f(x, 2) = 2x²')
 *       dots: Array<{ a: number, v: number }>   격자 자리의 단면 표본 (a = 남는 입력의 값)
 *       curve: Array<{ a: number, v: number }>  곡선을 그릴 촘촘한 표본
 *     }
 *
 *   slope  걸음 — 그 단면의 점에서의 기울기
 *     payload: {
 *       free: 'x' | 'y'
 *       a: number        점에서 남는 입력의 값
 *       v: number        점에서의 함숫값
 *       slope: number    단면 항 목록을 미분해 셈한 기울기
 *       symbol: string   편도함수 기호 ('∂f/∂x')
 *     }
 *
 *   both   걸음 — 같은 점의 두 기울기를 나란히
 *     payload: { items: Array<{ free: 'x' | 'y', symbol: string, value: number }> }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Axis = 'x' | 'y';
/** 두 변수 항 [계수, x 지수, y 지수]. */
export type Term2 = [number, number, number];
/** 한 변수 항 [계수, 지수]. */
export type Term1 = [number, number];
export type Sample = { a: number; v: number };

export type PartialSliceFacetData = {
  type: 'partial-slice';
  terms: Term2[];
  point: { x: number; y: number };
  /** 자르는 차례 — 붙드는 입력을 차례로. */
  order: Axis[];
  domain: { x: [number, number]; y: [number, number] };
  /** 바탕 격자 · 단면 표본의 간격. */
  gridStep: number;
  stepMs: number;
};

/** 곡선 표본은 격자 간격을 이만큼 더 잘게 나눈다. */
const CURVE_FINENESS = 8;
/** 단면 기울기와 편도함수 대조의 허용 오차. */
const MATCH_EPS = 1e-9;

function fail(path: string, why: string): never {
  throw new Error(`partial-slice: ${path} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function range(v: unknown, path: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '[lo, hi] 가 아니다');
  const lo = finite(v[0], `${path}[0]`);
  const hi = finite(v[1], `${path}[1]`);
  if (!(lo < hi)) fail(path, 'lo < hi 가 아니다');
  return [lo, hi];
}

function axis(v: unknown, path: string): Axis {
  if (v !== 'x' && v !== 'y') fail(path, "'x' 나 'y' 가 아니다");
  return v;
}

/** 자료의 모양을 검사하고 베낀다. 어긋나면 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowPartialSliceData(raw: unknown): PartialSliceFacetData {
  if (!isRecord(raw)) fail('data', '객체가 아니다');
  if (raw.type !== 'partial-slice') fail('data.type', "'partial-slice' 가 아니다");
  if (!Array.isArray(raw.terms) || raw.terms.length === 0) fail('data.terms', '비었거나 배열이 아니다');
  const terms = raw.terms.map((term: unknown, i: number): Term2 => {
    if (!Array.isArray(term) || term.length !== 3) fail(`data.terms[${i}]`, '[계수, x 지수, y 지수] 가 아니다');
    const c = finite(term[0], `data.terms[${i}][0]`);
    const px = finite(term[1], `data.terms[${i}][1]`);
    const py = finite(term[2], `data.terms[${i}][2]`);
    if (!Number.isInteger(px) || px < 0) fail(`data.terms[${i}][1]`, '음이 아닌 정수가 아니다');
    if (!Number.isInteger(py) || py < 0) fail(`data.terms[${i}][2]`, '음이 아닌 정수가 아니다');
    return [c, px, py];
  });
  if (!isRecord(raw.point)) fail('data.point', '객체가 아니다');
  const point = { x: finite(raw.point.x, 'data.point.x'), y: finite(raw.point.y, 'data.point.y') };
  if (!Array.isArray(raw.order) || raw.order.length === 0) fail('data.order', '비었거나 배열이 아니다');
  const order = raw.order.map((o: unknown, i: number) => axis(o, `data.order[${i}]`));
  if (new Set(order).size !== order.length) fail('data.order', '같은 입력을 두 번 붙든다');
  if (!isRecord(raw.domain)) fail('data.domain', '객체가 아니다');
  const domain = { x: range(raw.domain.x, 'data.domain.x'), y: range(raw.domain.y, 'data.domain.y') };
  if (point.x < domain.x[0] || point.x > domain.x[1]) fail('data.point.x', 'domain.x 밖이다');
  if (point.y < domain.y[0] || point.y > domain.y[1]) fail('data.point.y', 'domain.y 밖이다');
  const gridStep = finite(raw.gridStep, 'data.gridStep');
  if (!(gridStep > 0)) fail('data.gridStep', '양수가 아니다');
  const stepMs = finite(raw.stepMs, 'data.stepMs');
  if (!(stepMs >= 0)) fail('data.stepMs', '음수다');
  return { type: 'partial-slice', terms, point, order, domain, gridStep, stepMs };
}

// ── 항 목록의 셈 ─────────────────────────────────────────────

/** 두 변수 함숫값 Σ c · x^px · y^py. */
export function evalTerms2(terms: Term2[], x: number, y: number): number {
  let sum = 0;
  for (const [c, px, py] of terms) sum += c * x ** px * y ** py;
  return sum;
}

/** 한 변수 함숫값 Σ c · u^p. */
export function evalTerms1(terms: Term1[], u: number): number {
  let sum = 0;
  for (const [c, p] of terms) sum += c * u ** p;
  return sum;
}

/** 같은 지수를 합치고 계수 0 인 항을 버린다. 지수가 큰 것부터. */
function tidy(terms: Term1[]): Term1[] {
  const byPow = new Map<number, number>();
  for (const [c, p] of terms) byPow.set(p, (byPow.get(p) ?? 0) + c);
  return [...byPow.entries()]
    .filter(([, c]) => c !== 0)
    .sort((a, b) => b[0] - a[0])
    .map(([p, c]) => [c, p]);
}

/** 한 입력을 붙들어 남는 입력의 한 변수 항 목록을 만든다. */
export function holdTerms(terms: Term2[], held: Axis, at: number): Term1[] {
  return tidy(
    terms.map(([c, px, py]): Term1 => (held === 'y' ? [c * at ** py, px] : [c * at ** px, py])),
  );
}

/** 거듭제곱 규칙 — 계수 × 지수, 지수 − 1. 지수 0 인 항은 사라진다. */
export function deriveTerms1(terms: Term1[]): Term1[] {
  return tidy(terms.filter(([, p]) => p !== 0).map(([c, p]): Term1 => [c * p, p - 1]));
}

/** 두 변수 항 목록에서 곧바로 편미분한다 (대조용). */
export function partialTerms2(terms: Term2[], by: Axis): Term2[] {
  const out: Term2[] = [];
  for (const [c, px, py] of terms) {
    if (by === 'x' && px !== 0) out.push([c * px, px - 1, py]);
    if (by === 'y' && py !== 0) out.push([c * py, px, py - 1]);
  }
  return out;
}

// ── 글자 ─────────────────────────────────────────────────────

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const MINUS = '−';

function sup(p: number): string {
  return String(p)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)])
    .join('');
}

function varPart(name: string, p: number): string {
  if (p === 0) return '';
  return p === 1 ? name : `${name}${sup(p)}`;
}

/** 1 차 데이터의 수를 적힌 그대로 (빼기는 −). */
export function plainNum(n: number): string {
  const s = String(n);
  return n < 0 ? `${MINUS}${s.slice(1)}` : s;
}

/** 표시 도우미 — 소수 둘째 자리, 음의 영 없음, 빼기는 −. */
export function fmt2(n: number): string {
  const s = n.toFixed(2);
  if (Number(s) === 0) return '0.00';
  return s.startsWith('-') ? `${MINUS}${s.slice(1)}` : s;
}

/** 항 목록을 식 글자로. 각 항은 [계수, …지수] 이고 names 가 지수 자리의 변수 이름이다. */
function polyText(terms: number[][], names: string[]): string {
  if (terms.length === 0) return '0';
  return terms
    .map((term, i) => {
      const c = term[0];
      const vars = names.map((name, k) => varPart(name, term[k + 1])).join('');
      const mag = Math.abs(c);
      const coef = vars !== '' && mag === 1 ? '' : plainNum(mag);
      const body = `${coef}${vars}`;
      if (i === 0) return c < 0 ? `${MINUS}${body}` : body;
      return c < 0 ? ` ${MINUS} ${body}` : ` + ${body}`;
    })
    .join('');
}

// ── 알고리즘 ─────────────────────────────────────────────────

function steps(lo: number, hi: number, step: number): number[] {
  const n = Math.round((hi - lo) / step);
  if (Math.abs(lo + n * step - hi) > 1e-9) fail('data.gridStep', '구간을 나누어떨어뜨리지 않는다');
  return Array.from({ length: n + 1 }, (_, i) => lo + i * step);
}

function otherAxis(a: Axis): Axis {
  return a === 'x' ? 'y' : 'x';
}

export async function partialSlice(context: FacetContext<PartialSliceFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PartialSliceFacetData>;
  const data = narrowPartialSliceData(ctx.data);
  const { terms, point, order, domain, gridStep, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const xs = steps(domain.x[0], domain.x[1], gridStep);
  const ys = steps(domain.y[0], domain.y[1], gridStep);
  const values = ys.map((y) => xs.map((x) => evalTerms2(terms, x, y)));
  const gridMax = Math.max(...values.flat());

  const cuts = order.map((held) => {
    const free = otherAxis(held);
    const at = point[held];
    const [lo, hi] = domain[free];
    const slice = holdTerms(terms, held, at);
    const dots = steps(lo, hi, gridStep).map((a) => ({ a, v: evalTerms1(slice, a) }));
    const curve = steps(lo, hi, gridStep / CURVE_FINENESS).map((a) => ({ a, v: evalTerms1(slice, a) }));
    const max = Math.max(...curve.map((s) => s.v));
    return { free, held, at, lo, hi, max, slice, dots, curve };
  });

  const f = evalTerms2(terms, point.x, point.y);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      formula: `f(x, y) = ${polyText(terms, ['x', 'y'])}`,
      f,
      grid: { xs, ys, values, max: gridMax },
      frames: cuts.map(({ free, held, at, lo, hi, max }) => ({ free, held, at, lo, hi, max })),
    },
  });

  const found: Array<{ free: Axis; symbol: string; value: number }> = [];
  for (const cut of cuts) {
    if (!(await pause())) return;
    const args = cut.held === 'y' ? `x, ${plainNum(cut.at)}` : `${plainNum(cut.at)}, y`;
    await ctx.emit({
      type: 'slice',
      payload: {
        free: cut.free,
        held: cut.held,
        at: cut.at,
        terms: cut.slice,
        formula: `f(${args}) = ${polyText(cut.slice, [cut.free])}`,
        dots: cut.dots,
        curve: cut.curve,
      },
    });

    if (!(await pause())) return;
    const a = point[cut.free];
    const slope = evalTerms1(deriveTerms1(cut.slice), a);
    const direct = evalTerms2(partialTerms2(terms, cut.free), point.x, point.y);
    if (Math.abs(slope - direct) > MATCH_EPS) {
      fail(`slope.${cut.free}`, `단면 기울기 ${slope} 와 편도함수 ${direct} 가 다르다`);
    }
    const symbol = `∂f/∂${cut.free}`;
    await ctx.emit({
      type: 'slope',
      payload: { free: cut.free, a, v: evalTerms1(cut.slice, a), slope, symbol },
    });
    found.push({ free: cut.free, symbol, value: slope });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'both', payload: { items: found } });
}
