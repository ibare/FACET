/**
 * gradientStep — 두 입력 함수에서 경사 하강 한 걸음.
 *
 * 점에서 오르막 ∇f 를 재고(거듭제곱 규칙), 반대로 뒤집고(−∇f), 학습률 η 배로 줄여
 * 걸음(−η∇f)을 만든 뒤, 점을 그 걸음만큼 옮기고 함숫값을 다시 잰다. 갱신은 한 번뿐이다.
 *
 * 이벤트 (발신 차례):
 *   init     silent  { f0: number; bounds: { xMin: number; xMax: number; yMin: number; yMax: number } }
 *                    f0 = 출발점의 함숫값. bounds = 점 · 점 ± ∇f · 새 점 · 원점을 담는 정수 틀 (무대의 축 범위)
 *   measure          { gx: number; gy: number; len: number }            ∇f 와 그 길이
 *   flip             { from: [number, number]; vx: number; vy: number }  from = ∇f, (vx, vy) = −∇f
 *   scale            { from: [number, number]; rate: number; vx: number; vy: number; len: number }
 *                    from = −∇f, (vx, vy) = −η∇f (걸음), len = 걸음 길이
 *   move             { from: [number, number]; to: [number, number] }    점 → 점 + 걸음
 *   descend          { from: number; to: number; drop: number }          f(앞 점) → f(새 점), drop = from − to
 *
 * silent 는 init 하나다. 나머지 다섯이 걸음 1..5 이고 걸음 0 은 출발점과 f 다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec = [number, number];

/** 항 하나 = [계수, x 지수, y 지수]. 함숫값은 Σ 계수 · x^지수 · y^지수. */
export type Term = [number, number, number];

export type GradientStepFacetData = {
  type: 'gradient-step';
  stepMs: number;
  terms: Term[];
  start: Vec;
  rate: number;
};

export type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

/** 화면에 찍는 수식 기호 — 자료다. 번역하지 않는다. */
export const SYMBOLS = {
  f: 'f',
  grad: '∇f',
  neg: '−∇f',
  step: '−η∇f',
  eta: 'η',
  x: 'x',
  y: 'y',
} as const;

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowVec(v: unknown, path: string): Vec {
  if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) {
    throw new Error(`gradientStep: ${path} 는 수 두 개의 배열이어야 한다`);
  }
  return [v[0], v[1]];
}

/** 좁히개 — 알고리즘과 장면이 같은 것을 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowGradientStepData(raw: unknown): GradientStepFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('gradientStep: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'gradient-step') throw new Error(`gradientStep: initialData.type 이 'gradient-step' 이 아니다`);
  if (!isNum(d.stepMs) || d.stepMs <= 0) throw new Error('gradientStep: initialData.stepMs 는 양수여야 한다');
  if (!Array.isArray(d.terms) || d.terms.length === 0) throw new Error('gradientStep: initialData.terms 는 비지 않은 배열이어야 한다');
  const terms: Term[] = d.terms.map((tm: unknown, i: number) => {
    if (!Array.isArray(tm) || tm.length !== 3 || !tm.every(isNum)) {
      throw new Error(`gradientStep: initialData.terms[${i}] 는 [계수, x 지수, y 지수] 여야 한다`);
    }
    const [c, px, py] = tm as number[];
    if (!Number.isInteger(px) || px < 0 || !Number.isInteger(py) || py < 0) {
      throw new Error(`gradientStep: initialData.terms[${i}] 의 지수는 0 이상의 정수여야 한다`);
    }
    return [c as number, px as number, py as number];
  });
  const start = narrowVec(d.start, 'initialData.start');
  if (!isNum(d.rate) || d.rate <= 0) throw new Error('gradientStep: initialData.rate 는 양수여야 한다');
  return { type: 'gradient-step', stepMs: d.stepMs, terms, start, rate: d.rate };
}

/** 함숫값 Σ c · x^px · y^py */
export function evalF(terms: readonly Term[], x: number, y: number): number {
  let sum = 0;
  for (const [c, px, py] of terms) sum += c * x ** px * y ** py;
  return sum;
}

/** 편도함수 둘 — 거듭제곱 규칙 (계수 × 지수, 지수 − 1). 지수 0 인 쪽은 그 변수로 미분하면 사라진다. */
export function gradF(terms: readonly Term[], x: number, y: number): Vec {
  let gx = 0;
  let gy = 0;
  for (const [c, px, py] of terms) {
    if (px > 0) gx += c * px * x ** (px - 1) * y ** py;
    if (py > 0) gy += c * py * x ** px * y ** (py - 1);
  }
  return [gx, gy];
}

/** 표시 도우미 — 셈한 값은 소수 둘째 자리. 음의 영을 떼고 빼기는 − (U+2212). */
export function fmt2(n: number): string {
  const s = n.toFixed(2);
  const clean = Number(s) === 0 ? (0).toFixed(2) : s;
  return clean.replace('-', '−');
}

/** 1차 데이터의 수는 적힌 그대로 — 빼기만 − 로. */
export function fmtData(n: number): string {
  return String(n).replace('-', '−');
}

export async function gradientStep(ctxBase: FacetContext<GradientStepFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<GradientStepFacetData>;
  const data = narrowGradientStepData(ctx.data);
  const { terms, rate, stepMs } = data;
  const [x0, y0] = data.start;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const f0 = evalF(terms, x0, y0);
  const [gx, gy] = gradF(terms, x0, y0);
  const gLen = Math.hypot(gx, gy);
  const nx = -gx;
  const ny = -gy;
  const sx = rate * nx;
  const sy = rate * ny;
  const sLen = Math.hypot(sx, sy);
  const x1 = x0 + sx;
  const y1 = y0 + sy;
  const f1 = evalF(terms, x1, y1);

  // 무대의 축 범위 — 그릴 점 전부를 담는 정수 틀
  const xs = [0, x0, x0 + gx, x0 + nx, x1];
  const ys = [0, y0, y0 + gy, y0 + ny, y1];
  const bounds: Bounds = {
    xMin: Math.floor(Math.min(...xs)),
    xMax: Math.ceil(Math.max(...xs)),
    yMin: Math.floor(Math.min(...ys)),
    yMax: Math.ceil(Math.max(...ys)),
  };

  await ctx.emit({ type: 'init', silent: true, payload: { f0, bounds } });

  // 걸음 0 은 이미 점과 f 가 서 있는 화면이다 — 읽을 틈을 준다
  if (!(await pause())) return;
  await ctx.emit({ type: 'measure', payload: { gx, gy, len: gLen } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'flip', payload: { from: [gx, gy], vx: nx, vy: ny } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'scale', payload: { from: [nx, ny], rate, vx: sx, vy: sy, len: sLen } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'move', payload: { from: [x0, y0], to: [x1, y1] } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'descend', payload: { from: f0, to: f1, drop: f0 - f1 } });
}
