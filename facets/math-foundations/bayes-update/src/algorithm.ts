/**
 * bayes-update — 두 가설에 나눠 둔 믿음을 뽑은 공 하나마다 고친다.
 *
 * 한 번의 고침은 두 박자다. 믿음에 가능도를 곱해 합이 1 보다 작은 무게를 만들고(multiply),
 * 그 무게를 합으로 나눠 다시 합 1 인 믿음으로 맞춘다(normalize). 값은 정확한 분수로 들고 간다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   multiply   { draw: number, color: 'white' | 'black',
 *                likelihood: [Frac, Frac], weights: [Frac, Frac], total: Frac }
 *              draw 는 0 부터 센 뽑기 차례. likelihood 는 가설마다 그 색이 나올 확률(공 수 / 공 전체).
 *              weights 는 믿음 × 가능도, total 은 두 무게의 합.
 *   normalize  { draw: number, total: Frac, posterior: [Frac, Frac] }
 *              posterior 는 무게 / total. 합이 1 이다.
 *
 * Frac = { n: number, d: number } — 기약 분수, d > 0.
 * 걸음 0(사전)은 장면의 initial 이 initialData 에서 세운다. init 이벤트는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Frac = { n: number; d: number };
export type BallColor = 'white' | 'black';

export type BayesHypothesis = {
  /** 식별자 — 표시 이름은 messages 의 `label.<id>` */
  id: string;
  white: number;
  black: number;
  prior: Frac;
};

export type BayesUpdateFacetData = {
  type: 'bayes-update';
  hypotheses: [BayesHypothesis, BayesHypothesis];
  draws: BallColor[];
  stepMs: number;
};

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/** 분수를 만들며 줄인다. 분모 0 · 정수가 아닌 값은 던진다. */
export function frac(n: number, d: number): Frac {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) {
    throw new Error(`bayes-update: 분수 ${n}/${d} 를 만들 수 없다`);
  }
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (s * n) / g, d: (s * d) / g };
}

function mul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

function add(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function div(a: Frac, b: Frac): Frac {
  if (b.n === 0) throw new Error('bayes-update: 합이 0 인 무게로 나눌 수 없다');
  return frac(a.n * b.d, a.d * b.n);
}

/** 화면 글자 — 분수 `3/4`. */
export function fracText(f: Frac): string {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;
}

/** 화면 글자 — 퍼센트 소수 첫째 자리 `75.0%`. */
export function percentText(f: Frac): string {
  return `${((f.n / f.d) * 100).toFixed(1)}%`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function narrowFrac(x: unknown, path: string): Frac {
  if (!isRecord(x) || typeof x.n !== 'number' || typeof x.d !== 'number') {
    throw new Error(`bayes-update: ${path} 는 { n, d } 분수여야 한다`);
  }
  const f = frac(x.n, x.d);
  if (f.n < 0 || f.n > f.d) throw new Error(`bayes-update: ${path} 는 0 과 1 사이여야 한다`);
  return f;
}

function narrowCount(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) {
    throw new Error(`bayes-update: ${path} 는 0 이상의 정수여야 한다`);
  }
  return x;
}

function narrowHypothesis(x: unknown, path: string): BayesHypothesis {
  if (!isRecord(x) || typeof x.id !== 'string' || x.id === '') {
    throw new Error(`bayes-update: ${path}.id 가 없다`);
  }
  const white = narrowCount(x.white, `${path}.white`);
  const black = narrowCount(x.black, `${path}.black`);
  if (white + black === 0) throw new Error(`bayes-update: ${path} 주머니가 비었다`);
  return { id: x.id, white, black, prior: narrowFrac(x.prior, `${path}.prior`) };
}

/** initialData 좁히개 — 알고리즘 · 장면 · 무대가 함께 쓴다. */
export function narrowBayesData(x: unknown): BayesUpdateFacetData {
  if (!isRecord(x) || x.type !== 'bayes-update') {
    throw new Error("bayes-update: initialData.type 이 'bayes-update' 가 아니다");
  }
  if (!Array.isArray(x.hypotheses) || x.hypotheses.length !== 2) {
    throw new Error('bayes-update: initialData.hypotheses 는 가설 둘이어야 한다');
  }
  const hyps: [BayesHypothesis, BayesHypothesis] = [
    narrowHypothesis(x.hypotheses[0], 'initialData.hypotheses[0]'),
    narrowHypothesis(x.hypotheses[1], 'initialData.hypotheses[1]'),
  ];
  const priorSum = add(hyps[0].prior, hyps[1].prior);
  if (priorSum.n !== 1 || priorSum.d !== 1) {
    throw new Error('bayes-update: 사전 믿음의 합이 1 이 아니다');
  }
  if (!Array.isArray(x.draws) || x.draws.length === 0) {
    throw new Error('bayes-update: initialData.draws 가 비었다');
  }
  const draws = x.draws.map((c, i): BallColor => {
    if (c !== 'white' && c !== 'black') {
      throw new Error(`bayes-update: initialData.draws[${i}] 는 white 나 black 이어야 한다`);
    }
    return c;
  });
  if (typeof x.stepMs !== 'number' || !(x.stepMs > 0)) {
    throw new Error('bayes-update: initialData.stepMs 가 없다');
  }
  return { type: 'bayes-update', hypotheses: hyps, draws, stepMs: x.stepMs };
}

function likelihoodOf(h: BayesHypothesis, color: BallColor): Frac {
  return frac(color === 'white' ? h.white : h.black, h.white + h.black);
}

export async function bayesUpdate(ctx: FacetContext<BayesUpdateFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BayesUpdateFacetData>;
  const data = narrowBayesData(ctx.data);
  const { stepMs } = data;
  const [ha, hb] = data.hypotheses;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let belief: [Frac, Frac] = [ha.prior, hb.prior];

  // 걸음 0 은 사전이 이미 선 화면이라 첫 곱하기 앞에도 stepMs 를 둔다
  for (let i = 0; i < data.draws.length; i += 1) {
    if (!(await pause())) return;
    const color = data.draws[i];
    if (color === undefined) throw new Error(`bayes-update: draws[${i}] 가 없다`);
    const likelihood: [Frac, Frac] = [likelihoodOf(ha, color), likelihoodOf(hb, color)];
    const weights: [Frac, Frac] = [mul(belief[0], likelihood[0]), mul(belief[1], likelihood[1])];
    const total = add(weights[0], weights[1]);
    await ctx.emit({
      type: 'multiply',
      payload: { draw: i, color, likelihood, weights, total },
    });

    if (!(await pause())) return;
    const posterior: [Frac, Frac] = [div(weights[0], total), div(weights[1], total)];
    await ctx.emit({
      type: 'normalize',
      payload: { draw: i, total, posterior },
    });
    belief = posterior;
  }
}
