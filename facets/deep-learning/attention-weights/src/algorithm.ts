/**
 * attention-weights — 물음 하나가 열쇠 넷과 맞춰 본 점수가 합 1 인 무게 넷으로 나뉘고,
 * 값 넷이 제 무게만큼씩 결과에 쌓인다.
 *
 * 모형: 투영 없음 (q · k · v 가 데이터로 바로 주어진다).
 *   점수 s_j = (q·k_j) / √d_k  (d_k = 열쇠 벡터의 길이)
 *   무게 w_j = exp(s_j − max s) / Σ exp(s_i − max s)
 *   몫_j = w_j · v_j, 결과 = 0 벡터에서 시작해 몫을 데이터 차례로 더한 것
 *
 * 이벤트:
 *   init   { result: number[] }   — silent. 결과의 출발값(값과 같은 차원의 0 벡터).
 *          걸음 0 을 갈아 끼운다. 출발값은 이 한 곳에서만 만든다.
 * 이하 모두 silent 아님 — 한 걸음씩:
 *   score  { dots: number[]; scores: number[] }
 *          dots[j] = q·k_j (나누기 전), scores[j] = dots[j] / √d_k. 데이터 차례.
 *   weigh  { weights: number[]; sum: number; top: number }
 *          weights[j] = softmax 무게, sum = 무게의 합, top = 가장 큰 무게의 자리 (동률이면 던진다).
 *   share  { index: number; share: number[]; from: number[]; result: number[] }
 *          index 번째 값의 몫 share = w·v 를 from(앞 결과)에 더해 result 가 된다.
 *
 * 걸음 0 의 바탕(물음 · 열쇠와 값 넷)은 장면의 initial() 이 initialData 에서 세우고,
 * 결과의 출발값은 silent init 이 채운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AttentionItem = {
  /** 토큰 기호 (A · B …) — 식별자이자 표시 */
  id: string;
  key: number[];
  value: number[];
};

export type AttentionWeightsFacetData = {
  type: 'attention-weights';
  stepMs: number;
  query: number[];
  items: AttentionItem[];
};

function numVec(raw: unknown, where: string): number[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`attention-weights: ${where} 는 비지 않은 수 배열이어야 한다`);
  }
  return raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`attention-weights: ${where}[${i}] 가 수가 아니다`);
    }
    return x;
  });
}

/** initialData 의 모양을 검사해 좁힌다. 어긋나면 던진다. */
export function narrowAttentionWeightsData(raw: unknown): AttentionWeightsFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('attention-weights: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'attention-weights') {
    throw new Error(`attention-weights: 자료 type 이 다르다 (${String(r.type)})`);
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs >= 0)) {
    throw new Error('attention-weights: stepMs 가 0 이상의 수가 아니다');
  }
  const query = numVec(r.query, 'query');
  if (!Array.isArray(r.items) || r.items.length === 0) {
    throw new Error('attention-weights: items 가 비었다');
  }
  const valueLen = items0Len(r.items);
  const seen = new Set<string>();
  const items = r.items.map((it, i): AttentionItem => {
    if (typeof it !== 'object' || it === null) {
      throw new Error(`attention-weights: items[${i}] 가 객체가 아니다`);
    }
    const o = it as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') {
      throw new Error(`attention-weights: items[${i}].id 가 없다`);
    }
    if (seen.has(o.id)) throw new Error(`attention-weights: 토큰 ${o.id} 가 겹친다`);
    seen.add(o.id);
    const key = numVec(o.key, `items[${i}].key`);
    const value = numVec(o.value, `items[${i}].value`);
    if (key.length !== query.length) {
      throw new Error(`attention-weights: ${o.id} 의 열쇠 길이 ${key.length} 가 물음 길이 ${query.length} 와 다르다`);
    }
    if (value.length !== valueLen) {
      throw new Error(`attention-weights: ${o.id} 의 값 길이가 다른 값들과 다르다`);
    }
    return { id: o.id, key, value };
  });
  return { type: 'attention-weights', stepMs: r.stepMs, query, items };
}

function items0Len(items: unknown[]): number {
  const first = items[0];
  if (typeof first !== 'object' || first === null) {
    throw new Error('attention-weights: items[0] 가 객체가 아니다');
  }
  return numVec((first as Record<string, unknown>).value, 'items[0].value').length;
}

export function dotOf(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`attention-weights: 내적의 두 벡터 길이가 다르다 (${a.length} · ${b.length})`);
  }
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] as number) * (b[i] as number);
  return s;
}

/** softmax — 최댓값을 빼서 넘침을 막는다. */
export function softmaxOf(scores: readonly number[]): number[] {
  if (scores.length === 0) throw new Error('attention-weights: 점수가 없다');
  const m = Math.max(...scores);
  const ex = scores.map((s) => Math.exp(s - m));
  const z = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / z);
}

/** 가장 큰 무게의 자리. 동률이면 어느 쪽으로 기울일지 지어내지 않고 던진다. */
export function argmaxStrict(ws: readonly number[]): number {
  if (ws.length === 0) throw new Error('attention-weights: 무게가 없다');
  let best = 0;
  let tie = false;
  for (let i = 1; i < ws.length; i += 1) {
    const w = ws[i] as number;
    const b = ws[best] as number;
    if (w > b) {
      best = i;
      tie = false;
    } else if (w === b) {
      tie = true;
    }
  }
  if (tie) throw new Error('attention-weights: 가장 큰 무게가 동률이다');
  return best;
}

export async function attentionWeights(
  ctx: FacetContext<AttentionWeightsFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<AttentionWeightsFacetData>;
  const data = narrowAttentionWeightsData(ctx.data);
  const { stepMs, query, items } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const start = (items[0] as AttentionItem).value.map(() => 0);
  await ctx.emit({ type: 'init', payload: { result: start }, silent: true });

  // 걸음 0 은 이미 읽을 것이 있는 화면이라 첫 발신 앞에도 틈을 둔다.
  if (!(await pause())) return;

  const root = Math.sqrt(query.length);
  const dots = items.map((it) => dotOf(query, it.key));
  const scores = dots.map((d) => d / root);
  await ctx.emit({ type: 'score', payload: { dots, scores } });
  if (!(await pause())) return;

  const weights = softmaxOf(scores);
  const sum = weights.reduce((a, b) => a + b, 0);
  const top = argmaxStrict(weights);
  await ctx.emit({ type: 'weigh', payload: { weights, sum, top } });

  let result = start;
  for (let j = 0; j < items.length; j += 1) {
    if (!(await pause())) return;
    const it = items[j] as AttentionItem;
    const w = weights[j] as number;
    const share = it.value.map((x) => w * x);
    const from = result;
    result = from.map((x, i) => x + (share[i] as number));
    await ctx.emit({ type: 'share', payload: { index: j, share, from, result } });
  }
}
