/**
 * per-parameter-step — Adam 이 자리마다 제 기울기 크기로 나눈 보폭을 쓰는 것을 보인다.
 *
 * 손실 L(a, b) = kₐ·a² + k_b·b² 의 무게 둘을 Adam 으로 `updates` 번 갱신한다. 자리마다 따로
 * (t 는 1 부터 센 갱신 번호):
 *   m ← β1·m + (1 − β1)·g ;  v ← β2·v + (1 − β2)·g²
 *   m̂ = m / (1 − β1^t) ;  v̂ = v / (1 − β2^t)
 *   보폭 = η / (√v̂ + ε) ;  움직임 = 보폭 · m̂ ;  무게 ← 무게 − 움직임
 * "학습률 하나였다면" 의 움직임 η·g 는 같은 갱신의 g 로 셈한 대조 수다 — 그 길을 따로 돌리지 않는다.
 * 기울기 g 는 늘 갱신 전 자리에서 셈한다.
 *
 * 이벤트 (발신 순서대로):
 *
 * - `init` — **silent**. 걸음 0 을 갈아 끼운다.
 *     payload: { lo: number, hi: number }
 *       lo · hi — 화면의 로그 축이 담을 십진 자리 범위(정수, lo < hi). 화면에 뜨는 양
 *                 (기울기 · 보폭 · 움직임 · 한 폭 움직임 · η) 전부가 [10^lo, 10^hi] 안에 든다
 *
 * - `update` — 걸음. 갱신 한 번.
 *     payload: {
 *       t: number,                  // 몇 번째 갱신인가 (1 부터)
 *       before: [number, number],   // 갱신 전 무게 (a, b) — 장면의 지금 무게와 맞아야 한다
 *       g: [number, number],        // 갱신 전 자리의 기울기
 *       plain: [number, number],    // 학습률 하나였다면의 움직임 η·g
 *       rate: [number, number],     // 자리마다의 보폭 η / (√v̂ + ε)
 *       move: [number, number],     // 실제 움직임 보폭 · m̂
 *       after: [number, number],    // 갱신 뒤 무게
 *       ratio: number               // 보폭 비 b / a
 *     }
 *
 * 로그 축에 올리므로 화면에 뜨는 양은 모두 0 보다 커야 한다. 아니면 던진다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pair = readonly [number, number];

export type PerParameterStepWeight = {
  /** 기호 — 자료다. 화면에 그대로 뜬다 */
  id: string;
  /** 처음 값 */
  start: number;
  /** 손실에서 이 자리의 계수 k (L 의 한 항 k·w², 기울기 2k·w) */
  coef: number;
  /** 첫 모멘트 m 의 처음 값 */
  m0: number;
  /** 둘째 모멘트 v 의 처음 값 */
  v0: number;
};

export type PerParameterStepFacetData = {
  type: 'per-parameter-step';
  stepMs: number;
  /** 무게 둘 (a, b) */
  weights: readonly [PerParameterStepWeight, PerParameterStepWeight];
  eta: number;
  beta1: number;
  beta2: number;
  eps: number;
  updates: number;
};

export type PerParameterStepUpdate = {
  t: number;
  before: Pair;
  g: Pair;
  plain: Pair;
  rate: Pair;
  move: Pair;
  after: Pair;
  ratio: number;
};

function fin(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`per-parameter-step: ${path} 는 유한한 수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

function narrowWeight(v: unknown, path: string): PerParameterStepWeight {
  if (typeof v !== 'object' || v === null) throw new Error(`per-parameter-step: ${path} 는 객체여야 한다`);
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) {
    throw new Error(`per-parameter-step: ${path}.id 는 빈 칸이 아닌 문자열이어야 한다`);
  }
  const coef = fin(o.coef, `${path}.coef`);
  if (coef <= 0) throw new Error(`per-parameter-step: ${path}.coef 는 0 보다 커야 한다 (그릇이어야 한다)`);
  const v0 = fin(o.v0, `${path}.v0`);
  if (v0 < 0) throw new Error(`per-parameter-step: ${path}.v0 는 음수일 수 없다`);
  return { id: o.id, start: fin(o.start, `${path}.start`), coef, m0: fin(o.m0, `${path}.m0`), v0 };
}

/** `ctx.data` · `initialData` 의 좁히개. 어긋나면 필드 경로를 담아 던진다. 장면도 이것을 부른다 */
export function narrowPerParameterStepData(v: unknown): PerParameterStepFacetData {
  if (typeof v !== 'object' || v === null) throw new Error('per-parameter-step: 자료가 객체가 아니다');
  const o = v as Record<string, unknown>;
  if (o.type !== 'per-parameter-step') {
    throw new Error(`per-parameter-step: type 은 'per-parameter-step' 이어야 한다 (받은 값 ${String(o.type)})`);
  }
  const stepMs = fin(o.stepMs, 'stepMs');
  if (stepMs < 0) throw new Error('per-parameter-step: stepMs 는 음수일 수 없다');
  if (!Array.isArray(o.weights) || o.weights.length !== 2) {
    throw new Error('per-parameter-step: weights 는 무게 둘의 배열이어야 한다');
  }
  const wa = narrowWeight(o.weights[0], 'weights[0]');
  const wb = narrowWeight(o.weights[1], 'weights[1]');
  if (wa.id === wb.id) throw new Error(`per-parameter-step: weights 의 id 가 겹친다 (${wa.id})`);
  const eta = fin(o.eta, 'eta');
  if (eta <= 0) throw new Error('per-parameter-step: eta 는 0 보다 커야 한다');
  const beta1 = fin(o.beta1, 'beta1');
  const beta2 = fin(o.beta2, 'beta2');
  if (!(beta1 >= 0 && beta1 < 1)) throw new Error('per-parameter-step: beta1 은 [0, 1) 안이어야 한다');
  if (!(beta2 >= 0 && beta2 < 1)) throw new Error('per-parameter-step: beta2 는 [0, 1) 안이어야 한다');
  const eps = fin(o.eps, 'eps');
  if (eps < 0) throw new Error('per-parameter-step: eps 는 음수일 수 없다');
  const updates = fin(o.updates, 'updates');
  if (!Number.isInteger(updates) || updates < 1) {
    throw new Error('per-parameter-step: updates 는 1 이상의 정수여야 한다');
  }
  return { type: 'per-parameter-step', stepMs, weights: [wa, wb], eta, beta1, beta2, eps, updates };
}

/** Adam 을 규약대로 `updates` 번 돌린다. 순수 함수 */
export function runAdam(data: PerParameterStepFacetData): PerParameterStepUpdate[] {
  const [wa, wb] = data.weights;
  const w: [number, number] = [wa.start, wb.start];
  const m: [number, number] = [wa.m0, wb.m0];
  const v: [number, number] = [wa.v0, wb.v0];
  const coef: Pair = [wa.coef, wb.coef];
  const out: PerParameterStepUpdate[] = [];
  for (let t = 1; t <= data.updates; t += 1) {
    const before: Pair = [w[0], w[1]];
    const g: [number, number] = [0, 0];
    const plain: [number, number] = [0, 0];
    const rate: [number, number] = [0, 0];
    const move: [number, number] = [0, 0];
    for (let j = 0; j < 2; j += 1) {
      const gj = 2 * coef[j]! * w[j]!;
      m[j] = data.beta1 * m[j]! + (1 - data.beta1) * gj;
      v[j] = data.beta2 * v[j]! + (1 - data.beta2) * gj * gj;
      const mh = m[j]! / (1 - data.beta1 ** t);
      const vh = v[j]! / (1 - data.beta2 ** t);
      const r = data.eta / (Math.sqrt(vh) + data.eps);
      g[j] = gj;
      plain[j] = data.eta * gj;
      rate[j] = r;
      move[j] = r * mh;
    }
    for (let j = 0; j < 2; j += 1) w[j] = w[j]! - move[j]!;
    out.push({ t, before, g, plain, rate, move, after: [w[0], w[1]], ratio: rate[1] / rate[0] });
  }
  return out;
}

/** 화면에 뜨는 양 전부를 담는 십진 자리 범위. 0 이하가 있으면 로그 축에 못 올리므로 던진다 */
export function decadeRange(eta: number, ups: readonly PerParameterStepUpdate[]): { lo: number; hi: number } {
  let min = eta;
  let max = eta;
  for (const u of ups) {
    for (const [name, pair] of [
      ['g', u.g],
      ['plain', u.plain],
      ['rate', u.rate],
      ['move', u.move],
    ] as const) {
      for (let j = 0; j < 2; j += 1) {
        const x = pair[j]!;
        if (!(x > 0)) {
          throw new Error(`per-parameter-step: 갱신 ${u.t} 의 ${name}[${j}] = ${x} — 로그 축에는 0 보다 큰 값만 오른다`);
        }
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  return { lo, hi: hi > lo ? hi : lo + 1 };
}

export async function perParameterStep(context: FacetContext<PerParameterStepFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PerParameterStepFacetData>;
  const data = narrowPerParameterStepData(ctx.data);
  const ups = runAdam(data);
  const range = decadeRange(data.eta, ups);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'init', silent: true, payload: { lo: range.lo, hi: range.hi } });

  // 걸음 0 은 처음 무게와 η 가 이미 서 있는 화면이라, 첫 갱신 앞에도 읽을 틈을 둔다
  for (const u of ups) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'update',
      payload: {
        t: u.t,
        before: [u.before[0], u.before[1]],
        g: [u.g[0], u.g[1]],
        plain: [u.plain[0], u.plain[1]],
        rate: [u.rate[0], u.rate[1]],
        move: [u.move[0], u.move[1]],
        after: [u.after[0], u.after[1]],
        ratio: u.ratio,
      },
    });
  }
}
