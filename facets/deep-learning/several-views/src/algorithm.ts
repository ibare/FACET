/**
 * several-views — 같은 토큰 줄을 머리 둘이 각자의 행렬로 읽으면, 가장 크게 보는 짝이 갈린다.
 *
 * 머리마다: q = x·W_Q · k = x·W_K · v = x·W_V (d_k 2), 점수 q·k / √d_k, 줄마다 softmax,
 * 결과 = Σ 무게 · v. 네 토큰이 모두 묻는다(줄 넷). 가장 크게 보는 짝은 줄의 무게 argmax —
 * 동률이면 어느 쪽으로도 기울이지 않고 던진다. 끝에 토큰마다 머리들의 결과를 차례대로 잇는다
 * (W_O 없음 — 항등).
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *
 *   head    머리 하나의 네 줄 전부
 *           payload { head: string,                      // 머리 식별자 ('h1' …)
 *                     rows: { query: string,             // 묻는 토큰 기호
 *                             partner: string,           // 무게가 가장 큰 짝의 토큰 기호
 *                             weight: number,            // 그 짝의 무게
 *                             result: number[] }[],      // Σ 무게 · v (길이 d_k)
 *                     split: boolean[] | null }          // 첫 머리와 짝이 갈린 줄. 첫 머리면 null
 *
 *   concat  토큰마다 머리들의 결과를 차례대로 이은 것
 *           payload { rows: number[][],                  // 토큰 차례, 길이 = 머리 수 × d_k
 *                     widths: number[] }                 // 머리마다 붙인 칸 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HeadSpec = {
  id: string;
  wq: number[][];
  wk: number[][];
  wv: number[][];
};

export type SeveralViewsFacetData = {
  type: 'several-views';
  stepMs: number;
  tokens: string[];
  x: number[][];
  heads: HeadSpec[];
};

export type HeadRow = {
  query: string;
  partner: string;
  weight: number;
  result: number[];
};

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function narrowMatrix(v: unknown, rows: number, what: string): number[][] {
  if (!Array.isArray(v) || v.length !== rows || !v.every(isNumberArray)) {
    throw new Error(`several-views: ${what} 는 ${rows} 행의 수 행렬이어야 한다`);
  }
  const cols = (v[0] as number[]).length;
  if (cols === 0 || !v.every((r) => (r as number[]).length === cols)) {
    throw new Error(`several-views: ${what} 의 행 길이가 고르지 않다`);
  }
  return (v as number[][]).map((r) => [...r]);
}

/** 자료의 모양을 검사하고 베낀다. 어긋나면 던진다. */
export function narrowSeveralViews(data: unknown): SeveralViewsFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('several-views: initialData 가 없다');
  }
  const d = data as Record<string, unknown>;
  if (d.type !== 'several-views') throw new Error('several-views: type 이 다르다');
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) {
    throw new Error('several-views: stepMs 가 양수가 아니다');
  }
  const tokens = d.tokens;
  if (!Array.isArray(tokens) || tokens.length < 2 || !tokens.every((s) => typeof s === 'string' && s !== '')) {
    throw new Error('several-views: tokens 는 빈 칸 없는 기호 둘 이상이어야 한다');
  }
  if (new Set(tokens).size !== tokens.length) throw new Error('several-views: 토큰 기호가 겹친다');
  const x = narrowMatrix(d.x, tokens.length, 'x');
  const dModel = (x[0] as number[]).length;
  const heads = d.heads;
  if (!Array.isArray(heads) || heads.length < 2) {
    throw new Error('several-views: heads 는 둘 이상이어야 한다');
  }
  const outHeads: HeadSpec[] = heads.map((h, i) => {
    if (typeof h !== 'object' || h === null) throw new Error(`several-views: heads[${i}] 가 객체가 아니다`);
    const r = h as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') throw new Error(`several-views: heads[${i}].id 가 없다`);
    const wq = narrowMatrix(r.wq, dModel, `${r.id}.wq`);
    const wk = narrowMatrix(r.wk, dModel, `${r.id}.wk`);
    const wv = narrowMatrix(r.wv, dModel, `${r.id}.wv`);
    if ((wq[0] as number[]).length !== (wk[0] as number[]).length) {
      throw new Error(`several-views: ${r.id} 의 W_Q 와 W_K 열 수가 다르다`);
    }
    return { id: r.id, wq, wk, wv };
  });
  if (new Set(outHeads.map((h) => h.id)).size !== outHeads.length) {
    throw new Error('several-views: 머리 식별자가 겹친다');
  }
  return { type: 'several-views', stepMs: d.stepMs, tokens: [...tokens] as string[], x, heads: outHeads };
}

/** 행 벡터 · 행렬. */
function project(v: number[], w: number[][]): number[] {
  if (v.length !== w.length) throw new Error('several-views: 벡터 길이와 행렬 행 수가 다르다');
  const cols = (w[0] as number[]).length;
  const out: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    let s = 0;
    for (let r = 0; r < v.length; r += 1) s += (v[r] as number) * ((w[r] as number[])[c] as number);
    out.push(s);
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('several-views: 내적의 두 벡터 길이가 다르다');
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] as number) * (b[i] as number);
  return s;
}

/** 머리 하나 — 네 줄의 점수 · 무게 · 가장 큰 짝 · 결과. */
export function runHead(tokens: string[], x: number[][], head: HeadSpec): HeadRow[] {
  const q = x.map((v) => project(v, head.wq));
  const k = x.map((v) => project(v, head.wk));
  const v = x.map((row) => project(row, head.wv));
  const dk = (k[0] as number[]).length;
  const scale = Math.sqrt(dk);
  return tokens.map((query, i) => {
    const scores = k.map((kj) => dot(q[i] as number[], kj) / scale);
    const top = Math.max(...scores);
    const ex = scores.map((s) => Math.exp(s - top));
    const sum = ex.reduce((a, b) => a + b, 0);
    const weights = ex.map((e) => e / sum);
    const best = Math.max(...weights);
    const at = weights.flatMap((w, j) => (w === best ? [j] : []));
    if (at.length !== 1) {
      throw new Error(`several-views: ${head.id} 의 ${query} 줄에서 가장 큰 무게가 동률이다`);
    }
    const j = at[0] as number;
    const width = (v[0] as number[]).length;
    const result: number[] = [];
    for (let c = 0; c < width; c += 1) {
      let s = 0;
      for (let r = 0; r < v.length; r += 1) s += (weights[r] as number) * ((v[r] as number[])[c] as number);
      result.push(s);
    }
    return { query, partner: tokens[j] as string, weight: best, result };
  });
}

export async function severalViews(ctx: FacetContext<SeveralViewsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SeveralViewsFacetData>;
  const data = narrowSeveralViews(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 이 이미 토큰 줄과 머리 둘을 보이므로 첫 발신 앞에도 머문다.
  const runs: HeadRow[][] = [];
  for (const head of data.heads) {
    if (!(await pause())) return;
    const rows = runHead(data.tokens, data.x, head);
    const first = runs[0];
    const split = first === undefined ? null : rows.map((r, i) => r.partner !== (first[i] as HeadRow).partner);
    runs.push(rows);
    await ctx.emit({ type: 'head', payload: { head: head.id, rows, split } });
  }

  if (!(await pause())) return;
  const joined = data.tokens.map((_, i) => runs.flatMap((rows) => (rows[i] as HeadRow).result));
  const widths = runs.map((rows) => (rows[0] as HeadRow).result.length);
  await ctx.emit({ type: 'concat', payload: { rows: joined, widths } });
}
