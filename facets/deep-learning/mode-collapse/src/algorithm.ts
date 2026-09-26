/**
 * mode-collapse — 진짜가 두 봉우리일 때 만드는 쪽이 한쪽으로 몰리는 GAN 학습.
 *
 * 라운드 하나 = 가려내는 쪽 한 번(경사 상승) → 만드는 쪽 한 번(방금 갱신된 가려내는 쪽으로).
 * 모든 라운드를 셈하되, `showEvery` 의 배수인 라운드만 걸음으로 낸다.
 *
 * 이벤트:
 *   init  (silent) — 라운드 0 의 모습. 걸음 0 을 갈아 끼운다
 *     payload: RoundPayload & { real: number[]; realNeg: number; realPos: number; centers: number[] }
 *   round — 보일 라운드 하나를 마친 뒤의 모습
 *     payload: RoundPayload
 *
 * RoundPayload = {
 *   round: number;      라운드 번호
 *   a: number; b: number;         만드는 쪽 G(z) = a·z + b
 *   fakes: number[];    만든 것 (잡음 차례 그대로)
 *   v: number[]; c: number;       가려내는 쪽의 무게 · 치우침
 *   neg: number; pos: number;     만든 것의 쪽별 개수 (x < 0 · x > 0)
 *   spread: number;     만든 것의 가장 큰 것 − 가장 작은 것
 *   dNeg: number; dPos: number;   D(−2) · D(+2) — 가려내는 쪽이 두 봉우리 가운데에 매기는 점수
 * }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ModeCollapseFacetData = {
  type: 'mode-collapse';
  stepMs: number;
  /** 진짜 표본 (1 차원) */
  real: number[];
  /** 만드는 쪽의 잡음 — 라운드마다 같은 것 */
  noise: number[];
  a: number;
  b: number;
  /** 가려내는 쪽 특징의 가운데 mₖ */
  centers: number[];
  v: number[];
  c: number;
  lrD: number;
  lrG: number;
  rounds: number;
  showEvery: number;
};

function isNumArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function finite(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** 자료 좁히개 — 모양이 어긋나면 던진다. */
export function narrowModeCollapseData(raw: unknown): ModeCollapseFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('mode-collapse: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'mode-collapse') throw new Error(`mode-collapse: type 이 다르다 (${String(d.type)})`);
  for (const key of ['stepMs', 'a', 'b', 'c', 'lrD', 'lrG', 'rounds', 'showEvery'] as const) {
    if (!finite(d[key])) throw new Error(`mode-collapse: ${key} 가 수가 아니다`);
  }
  for (const key of ['real', 'noise', 'centers', 'v'] as const) {
    if (!isNumArray(d[key]) || (d[key] as number[]).length === 0) {
      throw new Error(`mode-collapse: ${key} 가 비었거나 수의 배열이 아니다`);
    }
  }
  const data = d as unknown as ModeCollapseFacetData;
  if (data.v.length !== data.centers.length) {
    throw new Error(`mode-collapse: v(${data.v.length}) 와 centers(${data.centers.length}) 의 길이가 다르다`);
  }
  if (!Number.isInteger(data.rounds) || !Number.isInteger(data.showEvery) || data.showEvery <= 0) {
    throw new Error('mode-collapse: rounds · showEvery 는 양의 정수여야 한다');
  }
  if (data.rounds % data.showEvery !== 0) {
    throw new Error(`mode-collapse: rounds(${data.rounds}) 가 showEvery(${data.showEvery}) 의 배수가 아니다`);
  }
  return data;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 종 모양 특징 φ(x) = exp(−(x − m)² / 2). */
export function feature(x: number, m: number): number {
  return Math.exp(-((x - m) ** 2) / 2);
}

/** 가려내는 쪽의 점수 D(x) = σ(c + Σ vₖ·φₖ(x)). 그림도 이 함수를 부른다. */
export function discScore(x: number, v: readonly number[], c: number, centers: readonly number[]): number {
  if (v.length !== centers.length) throw new Error('mode-collapse: v 와 centers 의 길이가 다르다');
  let s = c;
  for (let k = 0; k < centers.length; k += 1) s += v[k]! * feature(x, centers[k]!);
  return sigmoid(s);
}

/** 쪽별 개수 — 0 에 놓인 표본은 쪽이 없으니 던진다. */
export function countSides(xs: readonly number[]): { neg: number; pos: number } {
  let neg = 0;
  let pos = 0;
  for (const x of xs) {
    if (x < 0) neg += 1;
    else if (x > 0) pos += 1;
    else throw new Error('mode-collapse: 0 에 놓인 표본은 쪽이 없다');
  }
  return { neg, pos };
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error('mode-collapse: 빈 표본의 평균');
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

type Model = { a: number; b: number; v: number[]; c: number };

function generate(m: Model, noise: readonly number[]): number[] {
  return noise.map((z) => m.a * z + m.b);
}

/** 라운드 하나 — 가려내는 쪽 한 번, 그다음 만드는 쪽 한 번. 새 모형을 돌려준다. */
function trainRound(m: Model, data: ModeCollapseFacetData): Model {
  const { real, noise, centers, lrD, lrG } = data;
  // 가려내는 쪽 (경사 상승)
  const fakes = generate(m, noise);
  const gv = centers.map((mk) =>
    mean(real.map((x) => (1 - discScore(x, m.v, m.c, centers)) * feature(x, mk))) -
    mean(fakes.map((x) => discScore(x, m.v, m.c, centers) * feature(x, mk))),
  );
  const gc =
    mean(real.map((x) => 1 - discScore(x, m.v, m.c, centers))) -
    mean(fakes.map((x) => discScore(x, m.v, m.c, centers)));
  const v = m.v.map((vk, k) => vk + lrD * gv[k]!);
  const c = m.c + lrD * gc;
  // 만드는 쪽 — 방금 갱신된 가려내는 쪽으로
  const slope = (x: number): number => {
    let s = 0;
    for (let k = 0; k < centers.length; k += 1) s += v[k]! * feature(x, centers[k]!) * -(x - centers[k]!);
    return s;
  };
  const xs = noise.map((z) => m.a * z + m.b);
  const ga = mean(xs.map((x, i) => (1 - discScore(x, v, c, centers)) * slope(x) * noise[i]!));
  const gb = mean(xs.map((x) => (1 - discScore(x, v, c, centers)) * slope(x)));
  const next = { a: m.a + lrG * ga, b: m.b + lrG * gb, v, c };
  for (const n of [next.a, next.b, next.c, ...next.v]) {
    if (!Number.isFinite(n)) throw new Error('mode-collapse: 갱신이 수가 아닌 값을 냈다');
  }
  return next;
}

function snapshot(round: number, m: Model, data: ModeCollapseFacetData) {
  const fakes = generate(m, data.noise);
  const { neg, pos } = countSides(fakes);
  return {
    round,
    a: m.a,
    b: m.b,
    fakes,
    v: [...m.v],
    c: m.c,
    neg,
    pos,
    spread: Math.max(...fakes) - Math.min(...fakes),
    dNeg: discScore(-2, m.v, m.c, data.centers),
    dPos: discScore(2, m.v, m.c, data.centers),
  };
}

export async function modeCollapse(context: FacetContext<ModeCollapseFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ModeCollapseFacetData>;
  const data = narrowModeCollapseData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let model: Model = { a: data.a, b: data.b, v: [...data.v], c: data.c };
  const realSides = countSides(data.real);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      ...snapshot(0, model, data),
      real: [...data.real],
      realNeg: realSides.neg,
      realPos: realSides.pos,
      centers: [...data.centers],
    },
  });

  for (let round = 1; round <= data.rounds; round += 1) {
    if (ctx.cancelled) return;
    model = trainRound(model, data);
    if (round % data.showEvery !== 0) continue;
    // 걸음 0 (라운드 0) 도 읽을 틈이 있어야 하니 매 보일 라운드 앞에 문 하나
    if (!(await pause())) return;
    await ctx.emit({ type: 'round', payload: snapshot(round, model, data) });
  }
}
