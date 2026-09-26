/**
 * attend-to-all-at-once — 셀프 어텐션은 줄의 모든 짝을 한 걸음에 셈한다.
 *
 * 투영을 생략한다 — q = k = v = x. 점수 s_ij = x_i·x_j / √d_k (i 가 묻고 j 가 답한다,
 * 자기 자신 포함). 무게는 줄 i 마다 softmax. 결과_i = Σ_j 무게_ij · x_j.
 * 걸음 하나가 셈의 한 층(점수 · 무게 · 결과)을 **토큰 모두에** 한 번에 한다.
 * 셈에 자리 번호가 들어가지 않는다 — 자리는 거리를 말할 때만 읽는다.
 *
 * 이벤트 (셋 다 silent 아님, 차례대로 한 번씩):
 *
 * - `scores`  { layer: number; pairs: number; scores: number[][] }
 *     layer — 이 셈이 몇 번째 층인가 (1). pairs — 이 층까지 점수가 생긴 짝의 수.
 *     scores[i][j] — 줄 i 가 칸 j 에게 준 점수 (n × n).
 * - `weights` { layer: number; weights: number[][]; argmax: number[];
 *               focus: { query: number; key: number; distance: number; neighbor: number } }
 *     layer 2. weights[i] 는 줄 i 의 softmax. argmax[i] — 줄 i 가 가장 크게 보는 칸 (동률이면 던진다).
 *     focus — 자리 1 의 토큰(query 0)이 가장 크게 보는 칸 key, 둘의 자리 거리 distance,
 *     바로 옆 자리의 칸 neighbor (1).
 * - `results` { layer: number; results: number[][]; reach: { farKey: number; far: number; near: number } }
 *     layer 3. results[i] = Σ_j weights[i][j] · x_j.
 *     reach.farKey — 자리 1 과 자리 거리가 가장 먼 칸, reach.far — 그 짝에 점수가 생긴 층,
 *     reach.near — 바로 옆 짝(focus.neighbor)에 점수가 생긴 층.
 *
 * 층 번호는 셈 한 층을 마칠 때마다 1 씩 늘리는 `layer` 하나에서 나온다. 짝마다 점수가 생긴 층은
 * 그 값을 적어 둔 것이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AttendToken = { id: string; x: number[] };

export type AttendToAllAtOnceFacetData = {
  type: 'attend-to-all-at-once';
  stepMs: number;
  tokens: AttendToken[];
};

/** 자료를 좁힌다. 모양이 어긋나면 던진다 (C6). */
export function narrowAttendData(raw: unknown): AttendToAllAtOnceFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('attend-to-all-at-once: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'attend-to-all-at-once') throw new Error(`attend-to-all-at-once: 자료 type 이 다르다 (${String(r.type)})`);
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('attend-to-all-at-once: stepMs 가 양수가 아니다');
  if (!Array.isArray(r.tokens) || r.tokens.length < 2) throw new Error('attend-to-all-at-once: 토큰이 둘 미만이다');
  const seen = new Set<string>();
  let dim = -1;
  const tokens = r.tokens.map((tok, i): AttendToken => {
    if (typeof tok !== 'object' || tok === null) throw new Error(`attend-to-all-at-once: 토큰 ${i} 가 객체가 아니다`);
    const o = tok as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') throw new Error(`attend-to-all-at-once: 토큰 ${i} 의 id 가 없다`);
    if (seen.has(o.id)) throw new Error(`attend-to-all-at-once: 토큰 id 가 겹친다 (${o.id})`);
    seen.add(o.id);
    if (!Array.isArray(o.x) || o.x.length === 0) throw new Error(`attend-to-all-at-once: 토큰 ${o.id} 의 x 가 없다`);
    const x = o.x.map((v, k) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`attend-to-all-at-once: 토큰 ${o.id} 의 x[${k}] 가 수가 아니다`);
      return v;
    });
    if (dim === -1) dim = x.length;
    else if (x.length !== dim) throw new Error(`attend-to-all-at-once: 토큰 ${o.id} 의 벡터 길이 ${x.length} 가 ${dim} 과 다르다`);
    return { id: o.id, x };
  });
  return { type: 'attend-to-all-at-once', stepMs: r.stepMs, tokens };
}

function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`attend-to-all-at-once: 내적의 길이가 다르다 (${a.length} · ${b.length})`);
  let s = 0;
  for (let k = 0; k < a.length; k += 1) s += a[k]! * b[k]!;
  return s;
}

/** 점수 표 — 줄 i 가 묻고 칸 j 가 답한다. √d_k 로 나눈다. */
export function scoreTable(tokens: readonly AttendToken[]): number[][] {
  const dk = tokens[0]!.x.length;
  const scale = Math.sqrt(dk);
  return tokens.map((q) => tokens.map((k) => dot(q.x, k.x) / scale));
}

/** 줄 하나의 softmax. 최댓값을 빼고 셈한다. */
export function softmaxRow(row: readonly number[]): number[] {
  const top = Math.max(...row);
  const ex = row.map((s) => Math.exp(s - top));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / sum);
}

/** 줄의 무게 argmax. 동률이면 어느 쪽인지 지어내지 않고 던진다. */
export function argmaxRow(row: readonly number[], label: string): number {
  let best = 0;
  for (let j = 1; j < row.length; j += 1) if (row[j]! > row[best]!) best = j;
  const ties = row.filter((w) => w === row[best]!).length;
  if (ties > 1) throw new Error(`attend-to-all-at-once: 줄 ${label} 의 가장 큰 무게가 동률이다`);
  return best;
}

/** 결과 — 무게로 값(= x)을 섞는다. */
export function mixValues(weights: readonly number[][], tokens: readonly AttendToken[]): number[][] {
  const dim = tokens[0]!.x.length;
  return weights.map((row) => {
    const out = new Array<number>(dim).fill(0);
    row.forEach((w, j) => {
      const v = tokens[j]!.x;
      for (let k = 0; k < dim; k += 1) out[k] = out[k]! + w * v[k]!;
    });
    return out;
  });
}

export async function attendToAllAtOnce(
  ctxBase: FacetContext<AttendToAllAtOnceFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<AttendToAllAtOnceFacetData>;
  const { tokens, stepMs } = narrowAttendData(ctx.data);
  const n = tokens.length;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 토큰 다섯이 이미 서 있는 화면이다 — 읽을 틈을 먼저 둔다.
  if (!(await pause())) return;

  let layer = 0;

  // 층 1 — 모든 짝의 점수를 한 번에. 짝마다 점수가 생긴 층을 적어 둔다.
  const scores = scoreTable(tokens);
  layer += 1;
  const scoredAt = layer;
  const layerOfPair: number[][] = scores.map((row) => row.map(() => scoredAt));
  const pairs = layerOfPair.reduce((acc, row) => acc + row.length, 0);
  await ctx.emit({ type: 'scores', payload: { layer, pairs, scores } });
  if (!(await pause())) return;

  // 층 2 — 모든 줄의 softmax 를 한 번에.
  const weights = scores.map((row) => softmaxRow(row));
  const argmax = weights.map((row, i) => argmaxRow(row, tokens[i]!.id));
  const query = 0;
  const key = argmax[query]!;
  const neighbor = query + 1;
  layer += 1;
  await ctx.emit({
    type: 'weights',
    payload: {
      layer,
      weights,
      argmax,
      focus: { query, key, distance: Math.abs(key - query), neighbor },
    },
  });
  if (!(await pause())) return;

  // 층 3 — 모든 결과를 한 번에. 어느 결과도 다른 결과를 기다리지 않는다.
  const results = mixValues(weights, tokens);
  let farKey = query;
  for (let j = 0; j < n; j += 1) if (Math.abs(j - query) > Math.abs(farKey - query)) farKey = j;
  const far = layerOfPair[query]![farKey]!;
  const near = layerOfPair[query]![neighbor]!;
  layer += 1;
  await ctx.emit({ type: 'results', payload: { layer, results, reach: { farKey, far, near } } });
}
