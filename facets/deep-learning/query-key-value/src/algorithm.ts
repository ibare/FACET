/**
 * query-key-value — 한 입력이 물음 · 열쇠 · 값으로 갈라지고, 묻는 토큰이 열쇠에 맞춰 본 뒤
 * 값을 가져온다.
 *
 * 모형: 행 벡터 x 에 투영 행렬을 오른쪽에서 곱한다 (q = x·W_Q · k = x·W_K · v = x·W_V).
 * 맞춰 보기 = q·k / √d_k, 무게 = softmax (최댓값을 빼고 셈), 가져온 값 = Σ 무게 · v.
 * 셈은 끝까지 배정도로 하고 자르지 않는다. 표시는 그림이 한다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   query   { token: string; vec: [number, number] }
 *           묻는 토큰의 물음 q = x·W_Q
 *   keys    { vecs: [number, number][] }            토큰 차례대로 k = x·W_K
 *   values  { vecs: [number, number][] }            토큰 차례대로 v = x·W_V
 *   match   { raw: number[]; scores: number[]; dk: number }
 *           토큰 차례대로 q·k 와 q·k / √d_k, 그리고 나눈 d_k (열쇠 벡터의 길이)
 *   weigh   { weights: number[]; best: number; sum: number }
 *           softmax 무게 · 가장 잘 맞은 열쇠의 자리(동률이면 던진다) · 무게의 합
 *   fetch   { result: [number, number]; dist: { x: number; k: number; v: number }; nearest: 'x' | 'k' | 'v' }
 *           가져온 값 Σ w·v, 그리고 그것과 가장 잘 맞은 토큰의 x · k · v 사이 거리, 가장 가까운 역할
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = [number, number];
export type Mat2 = [Vec2, Vec2];
export type Role = 'x' | 'k' | 'v';

export type QueryKeyValueFacetData = {
  type: 'query-key-value';
  stepMs: number;
  tokens: string[];
  x: Vec2[];
  wQ: Mat2;
  wK: Mat2;
  wV: Mat2;
  asker: string;
};

function isVec2(v: unknown): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isMat2(m: unknown): m is Mat2 {
  return Array.isArray(m) && m.length === 2 && m.every(isVec2);
}

/** 자료를 좁힌다. 모양이 어긋나면 던진다. */
export function narrowQueryKeyValue(raw: unknown): QueryKeyValueFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('query-key-value: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'query-key-value') throw new Error(`query-key-value: type 이 다르다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('query-key-value: stepMs 가 양수가 아니다');
  const tokens = d.tokens;
  if (!Array.isArray(tokens) || tokens.length === 0 || !tokens.every((s) => typeof s === 'string' && s.length > 0)) {
    throw new Error('query-key-value: tokens 가 비었거나 글자가 아닌 것이 있다');
  }
  if (new Set(tokens).size !== tokens.length) throw new Error('query-key-value: 같은 토큰이 둘 있다');
  const x = d.x;
  if (!Array.isArray(x) || x.length !== tokens.length || !x.every(isVec2)) {
    throw new Error('query-key-value: x 는 토큰마다 길이 2 인 벡터여야 한다');
  }
  for (const key of ['wQ', 'wK', 'wV'] as const) {
    if (!isMat2(d[key])) throw new Error(`query-key-value: ${key} 가 2×2 행렬이 아니다`);
  }
  if (typeof d.asker !== 'string' || !tokens.includes(d.asker)) {
    throw new Error(`query-key-value: 묻는 토큰 ${String(d.asker)} 가 토큰 줄에 없다`);
  }
  return {
    type: 'query-key-value',
    stepMs: d.stepMs,
    tokens: [...(tokens as string[])],
    x: (x as Vec2[]).map((v) => [v[0], v[1]] as Vec2),
    wQ: d.wQ as Mat2,
    wK: d.wK as Mat2,
    wV: d.wV as Mat2,
    asker: d.asker,
  };
}

/** 행 벡터 x 에 행렬 W 를 오른쪽에서 곱한다 (x·W). */
export function project(x: Vec2, w: Mat2): Vec2 {
  return [x[0] * w[0][0] + x[1] * w[1][0], x[0] * w[0][1] + x[1] * w[1][1]];
}

export function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function softmax(scores: number[]): number[] {
  if (scores.length === 0) throw new Error('softmax: 점수가 없다');
  const top = Math.max(...scores);
  const ex = scores.map((s) => Math.exp(s - top));
  const total = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / total);
}

/** 가장 큰 자리. 동률이면 어느 쪽으로 기울일지 지어내지 않고 던진다. */
export function argmaxStrict(values: number[], what: string): number {
  if (values.length === 0) throw new Error(`${what}: 비었다`);
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[best]!) best = i;
  }
  const ties = values.filter((v) => v === values[best]).length;
  if (ties > 1) throw new Error(`${what}: 가장 큰 값이 ${ties} 곳에서 같다`);
  return best;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export async function queryKeyValue(ctx: FacetContext<QueryKeyValueFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<QueryKeyValueFacetData>;
  const data = narrowQueryKeyValue(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const askerAt = data.tokens.indexOf(data.asker);
  const xAsker = data.x[askerAt];
  if (xAsker === undefined) throw new Error(`query-key-value: 묻는 토큰 ${data.asker} 의 입력이 없다`);

  // 걸음 0 은 토큰과 입력이 이미 선 화면이라 읽을 틈을 먼저 둔다.
  if (!(await pause())) return;

  const q = project(xAsker, data.wQ);
  await rctx.emit({ type: 'query', payload: { token: data.asker, vec: q } });
  if (!(await pause())) return;

  const keys = data.x.map((x) => project(x, data.wK));
  await rctx.emit({ type: 'keys', payload: { vecs: keys } });
  if (!(await pause())) return;

  const values = data.x.map((x) => project(x, data.wV));
  await rctx.emit({ type: 'values', payload: { vecs: values } });
  if (!(await pause())) return;

  const dk = keys[0]!.length;
  const raw = keys.map((k) => dot(q, k));
  const scores = raw.map((r) => r / Math.sqrt(dk));
  await rctx.emit({ type: 'match', payload: { raw, scores, dk } });
  if (!(await pause())) return;

  const weights = softmax(scores);
  const best = argmaxStrict(weights, 'query-key-value 무게');
  const sum = weights.reduce((a, b) => a + b, 0);
  await rctx.emit({ type: 'weigh', payload: { weights, best, sum } });
  if (!(await pause())) return;

  const result: Vec2 = [0, 0];
  for (let j = 0; j < values.length; j++) {
    if (rctx.cancelled) return;
    const v = values[j]!;
    const w = weights[j]!;
    result[0] += w * v[0];
    result[1] += w * v[1];
  }
  const xBest = data.x[best]!;
  const dist = {
    x: distance(result, xBest),
    k: distance(result, keys[best]!),
    v: distance(result, values[best]!),
  };
  const roles: Role[] = ['x', 'k', 'v'];
  const nearest = roles[argmaxStrict(roles.map((r) => -dist[r]), 'query-key-value 거리')]!;
  await rctx.emit({ type: 'fetch', payload: { result, dist, nearest } });
}
