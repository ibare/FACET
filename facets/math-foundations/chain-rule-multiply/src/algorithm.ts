/**
 * chain-rule-multiply — 함수 둘을 이어 붙였을 때 입력의 작은 움직임이 두 번 불어나는 것.
 *
 * 안쪽 함수 u(x) 와 바깥 함수 y(u) 는 항 목록 `[[계수, 지수], …]` 으로 온다.
 * 입력을 Δx 밀면 u 가 Δu, y 가 Δy 움직인다. 단계의 배는 Δu/Δx · Δy/Δu, 통째 배는 Δy/Δx.
 * 끝 걸음은 거듭제곱 규칙으로 du/dx(x₀) · dy/du(u₀) 와 그 곱을 셈한다.
 *
 * 이벤트 (전부 `ctx.emit`, 차례대로)
 *   init   silent: true — 걸음 0 을 갈아 끼운다
 *          payload { symbols: [입력, 가운데, 출력], inner: 항 목록, outer: 항 목록,
 *                    x0, u0, y0: number, span: number (세 움직임 중 가장 큰 크기 — 축척용) }
 *   push   payload { dx: number, x1: number }                         입력을 민다
 *   cross  payload { stage: 'inner' | 'outer', to: number, delta: number, ratio: number }
 *          움직임이 한 단계를 건너 다음 자리에 닿는다. to 는 새 값, delta 는 그 자리의 움직임,
 *          ratio 는 delta / 앞 자리의 움직임
 *   whole  payload { ratio: number, r1: number, r2: number }          통째 배 Δy/Δx 와 두 단계 배
 *   limit  payload { d1: number, d2: number, d: number }              민 폭 → 0: du/dx · dy/du · 곱
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 항 하나 — [계수, 지수]. */
export type Term = [number, number];

export type ChainRuleMultiplyFacetData = {
  type: 'chain-rule-multiply';
  /** 수식 기호 — 입력 · 가운데 · 출력 (x · u · y) */
  symbols: [string, string, string];
  /** 안쪽 함수 u(x) 의 항 목록 */
  inner: Term[];
  /** 바깥 함수 y(u) 의 항 목록 */
  outer: Term[];
  /** 출발 입력 */
  x0: number;
  /** 미는 폭 */
  dx: number;
  stepMs: number;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowTerms(v: unknown, path: string): Term[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${path}: 항 목록이 비었거나 배열이 아니다`);
  return v.map((term, i) => {
    if (!Array.isArray(term) || term.length !== 2) throw new Error(`${path}[${i}]: [계수, 지수] 가 아니다`);
    const [c, e] = term as unknown[];
    if (!isFiniteNumber(c)) throw new Error(`${path}[${i}][0]: 계수가 수가 아니다`);
    if (!isFiniteNumber(e) || !Number.isInteger(e) || e < 0) throw new Error(`${path}[${i}][1]: 지수가 0 이상의 정수가 아니다`);
    return [c, e] as Term;
  });
}

/** 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function narrowChainRuleMultiplyData(raw: unknown): ChainRuleMultiplyFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('chain-rule-multiply: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'chain-rule-multiply') throw new Error(`chain-rule-multiply: type 이 다르다 (${String(d.type)})`);
  const s = d.symbols;
  if (!Array.isArray(s) || s.length !== 3 || !s.every((x) => typeof x === 'string' && x.length > 0)) {
    throw new Error('chain-rule-multiply: symbols 는 빈칸 없는 글자 셋이어야 한다');
  }
  if (!isFiniteNumber(d.x0)) throw new Error('chain-rule-multiply: x0 가 수가 아니다');
  if (!isFiniteNumber(d.dx) || d.dx === 0) throw new Error('chain-rule-multiply: dx 는 0 이 아닌 수여야 한다');
  if (!isFiniteNumber(d.stepMs) || d.stepMs < 0) throw new Error('chain-rule-multiply: stepMs 가 음이 아닌 수가 아니다');
  return {
    type: 'chain-rule-multiply',
    symbols: [s[0] as string, s[1] as string, s[2] as string],
    inner: narrowTerms(d.inner, 'chain-rule-multiply.inner'),
    outer: narrowTerms(d.outer, 'chain-rule-multiply.outer'),
    x0: d.x0,
    dx: d.dx,
    stepMs: d.stepMs,
  };
}

/** 항 목록의 값 — Σ 계수 · v^지수. */
export function evalTerms(terms: readonly Term[], v: number): number {
  let sum = 0;
  for (const [c, e] of terms) sum += c * v ** e;
  return sum;
}

/** 거듭제곱 규칙 — 계수 × 지수, 지수 − 1. 지수 0 인 항은 사라진다. */
export function derivTerms(terms: readonly Term[]): Term[] {
  const out: Term[] = [];
  for (const [c, e] of terms) if (e > 0) out.push([c * e, e - 1]);
  return out;
}

const MINUS = '−';

/** 수 표기 — 자릿수 고정, 음의 영 없음, 빼기는 U+2212. */
export function fmtNum(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function power(sym: string, e: number): string {
  if (e === 0) return '';
  if (e === 1) return sym;
  return sym + String(e).split('').map((ch) => SUPERSCRIPT[Number(ch)]).join('');
}

/**
 * 항 목록을 식 글자로 찍는다 (`3x` · `u²/3`). 계수는 정수이거나 정수의 역수여야 한다 —
 * 그 밖의 계수를 소수로 잘라 찍으면 식이 거짓말을 하므로 던진다.
 */
export function formatTerms(terms: readonly Term[], sym: string): string {
  const parts = terms.map(([c, e], i) => {
    const sign = c < 0 ? MINUS : i === 0 ? '' : '+';
    const a = Math.abs(c);
    const p = power(sym, e);
    let body: string;
    if (Number.isInteger(a)) body = a === 1 && p !== '' ? p : String(a) + p;
    else {
      const inv = 1 / a;
      const k = Math.round(inv);
      if (Math.abs(inv - k) > 1e-9 || p === '') throw new Error(`formatTerms: 계수 ${c} 를 식으로 찍을 수 없다 (항 ${i})`);
      body = `${p}/${k}`;
    }
    return i === 0 ? sign + body : ` ${sign} ${body}`;
  });
  return parts.join('');
}

export async function chainRuleMultiply(context: FacetContext<ChainRuleMultiplyFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ChainRuleMultiplyFacetData>;
  const data = narrowChainRuleMultiplyData(ctx.data);
  const { inner, outer, x0, dx, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const u0 = evalTerms(inner, x0);
  const y0 = evalTerms(outer, u0);
  const x1 = x0 + dx;
  const u1 = evalTerms(inner, x1);
  const y1 = evalTerms(outer, u1);
  const du = u1 - u0;
  const dy = y1 - y0;
  if (du === 0) throw new Error('chain-rule-multiply: Δu 가 0 이라 둘째 단계의 배를 셈할 수 없다');
  const r1 = du / dx;
  const r2 = dy / du;
  const whole = dy / dx;
  const d1 = evalTerms(derivTerms(inner), x0);
  const d2 = evalTerms(derivTerms(outer), u0);
  const span = Math.max(Math.abs(dx), Math.abs(du), Math.abs(dy));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      symbols: [...data.symbols],
      inner: inner.map((t) => [...t]),
      outer: outer.map((t) => [...t]),
      x0,
      u0,
      y0,
      span,
    },
  });

  // 걸음 0 은 세 자리의 값이 이미 서 있는 화면이라 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'push', payload: { dx, x1 } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'cross', payload: { stage: 'inner', to: u1, delta: du, ratio: r1 } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'cross', payload: { stage: 'outer', to: y1, delta: dy, ratio: r2 } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'whole', payload: { ratio: whole, r1, r2 } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'limit', payload: { d1, d2, d: d1 * d2 } });
}
