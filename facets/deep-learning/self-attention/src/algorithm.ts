/**
 * self-attention — 같은 투영 행렬을 머리 하나로 읽나, 열을 둘로 나눠 머리 둘로 읽나.
 *
 * 토큰 넷의 x(행 벡터, d_model 칸)를 W_Q · W_K · W_V 로 한꺼번에 투영하고, 머리 h 는 투영 열
 * `h·d_k .. h·d_k + d_k − 1` 만 읽는다 (d_k = d_model / 머리 수). 행렬은 손잡이에 따라 바뀌지 않는다 —
 * 머리 수는 열을 무리 짓는 법만 바꾼다. 투영 무게 수는 3 × d_model × d_model 로 늘 같다.
 *
 * 셈 (IR `multiHeadAttention` 과 식 순서까지 같다):
 *   - q = x·W_Q, k = x·W_K, v = x·W_V — 정수
 *   - raw[h][i][j] = Σ_c q[i][h·d_k + c] · k[j][h·d_k + c] — 정수
 *   - 무게 = exp((raw_j − rawMax) / √d_k) 를 j = 0..n−1 차례로 더한 합으로 나눈 것 (줄마다)
 *   - 결과[i][h·d_k + c] = Σ_j 무게[h][i][j] · v[j][h·d_k + c] (머리 결과를 차례로 잇는다, W_O 없음)
 *
 * 동률 규칙 — 줄의 가장 큰 raw(정수)를 가진 열쇠가 하나면 "선 짝", 둘 이상이면 "동률 짝". 동률을
 * 어느 쪽으로도 깨지 않는다. 실수 무게로 견주지 않는다. 기본 데이터에서 머리 하나의 네 줄 모두가
 * 동률(q·k 5 = 5)이고, 머리 둘의 여덟 줄에는 동률이 없다.
 *
 * 이벤트 (한 판 = 걸음 여섯, 걸음 경계는 `sleep` 과 입력 대기):
 *   frame     걸음 0. { tokens: string[], x: int[n][dm], heads: int, dk: int, sqrtDk: number,
 *             maxHeads: int }                                            — silent 아님
 *   project   걸음 1. { q: int[n][dm], k: int[n][dm], v: int[n][dm] }  — silent 아님
 *   score     걸음 2. { raw: int[heads][n][n], score: number[heads][n][n] } — silent 아님
 *   softmax   걸음 3. { weights: number[heads][n][n], topLow: number }  — silent 아님
 *             topLow = 줄마다 가장 큰 무게 중 가장 작은 것
 *   pick      걸음 4. { picks: { keys: int[], tied: boolean }[heads][n], clear: int, tied: int,
 *             rows: int }                                               — silent 아님
 *   mix       걸음 5. { result: number[n][dm], valueMax: number }        — silent 아님
 *             valueMax = v 성분 절댓값의 최댓값 (결과 막대의 축)
 *   phase     { phase: string }                                         — silent
 *
 * phase 어휘 (irs.ts 와 같다): project · score · softmax · pick · mix
 *
 * 계기:
 *   clear-rows    짝이 홀로 선 줄 수 (줄 = (머리, 묻는 토큰))
 *   tied-rows     짝이 동률인 줄 수
 *   weight-count  투영 무게 수 (3 × d_model × d_model)
 *   판 머리(걸음 0)에서 셋 모두 0 으로 되돌린다 — 지금 보이는 값과의 차이로.
 *
 * 입력: { type: 'heads', payload: { value } } — value 는 headsLadder 안의 수.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SelfAttentionData = {
  type: 'self-attention';
  stepMs: number;
  tokens: string[];
  x: number[][];
  wq: number[][];
  wk: number[][];
  wv: number[][];
  headsLadder: number[];
  heads: number;
};

export type HeadPick = { keys: number[]; tied: boolean };

export type AttentionRound = {
  heads: number;
  dk: number;
  sqrtDk: number;
  q: number[][];
  k: number[][];
  v: number[][];
  raw: number[][][];
  score: number[][][];
  weights: number[][][];
  picks: HeadPick[][];
  clear: number;
  tied: number;
  rows: number;
  topLow: number;
  result: number[][];
  valueMax: number;
  weightCount: number;
};

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function readIntMatrix(v: unknown, rows: number, cols: number, name: string): number[][] {
  if (!Array.isArray(v) || v.length !== rows) throw new Error(`self-attention: ${name} 는 ${rows} 행이어야 한다`);
  return v.map((row, i) => {
    if (!Array.isArray(row) || row.length !== cols) {
      throw new Error(`self-attention: ${name}[${i}] 는 ${cols} 칸이어야 한다`);
    }
    return row.map((cell, c) => {
      if (!isInt(cell)) throw new Error(`self-attention: ${name}[${i}][${c}] 는 정수여야 한다`);
      return cell;
    });
  });
}

/** `ctx.data` 좁히개 — 모양이 어긋나면 던진다. */
export function readSelfAttentionData(raw: unknown): SelfAttentionData {
  if (typeof raw !== 'object' || raw === null) throw new Error('self-attention: 데이터가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'self-attention') throw new Error('self-attention: type 이 다르다');
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('self-attention: stepMs 가 양수가 아니다');
  const tokens = d.tokens;
  if (!Array.isArray(tokens) || tokens.length < 2) throw new Error('self-attention: 토큰이 둘 이상이어야 한다');
  const toks = tokens.map((tok, i) => {
    if (typeof tok !== 'string' || tok.length === 0) throw new Error(`self-attention: tokens[${i}] 가 글자가 아니다`);
    return tok;
  });
  if (new Set(toks).size !== toks.length) throw new Error('self-attention: 토큰이 겹친다');
  const n = toks.length;
  if (!Array.isArray(d.x) || !Array.isArray(d.x[0])) throw new Error('self-attention: x 가 행렬이 아니다');
  const dm = (d.x[0] as unknown[]).length;
  if (dm < 1) throw new Error('self-attention: d_model 이 0 이다');
  const x = readIntMatrix(d.x, n, dm, 'x');
  const wq = readIntMatrix(d.wq, dm, dm, 'wq');
  const wk = readIntMatrix(d.wk, dm, dm, 'wk');
  const wv = readIntMatrix(d.wv, dm, dm, 'wv');
  const ladder = d.headsLadder;
  if (!Array.isArray(ladder) || ladder.length === 0) throw new Error('self-attention: headsLadder 가 비었다');
  const headsLadder = ladder.map((h, i) => {
    if (!isInt(h) || h < 1 || dm % h !== 0) {
      throw new Error(`self-attention: headsLadder[${i}] 는 d_model 을 나누는 양의 정수여야 한다`);
    }
    return h;
  });
  if (!isInt(d.heads) || !headsLadder.includes(d.heads)) throw new Error('self-attention: heads 가 사다리 밖이다');
  return { type: 'self-attention', stepMs: d.stepMs, tokens: toks, x, wq, wk, wv, headsLadder, heads: d.heads };
}

function projectAll(x: number[][], w: number[][]): number[][] {
  const dm = w.length;
  return x.map((row) => {
    const out: number[] = [];
    for (let col = 0; col < dm; col += 1) {
      let s = 0;
      for (let r = 0; r < dm; r += 1) s += row[r]! * w[r]![col]!;
      out.push(s);
    }
    return out;
  });
}

/** 한 판의 셈 전부 — 화면과 검사가 같은 값을 본다. */
export function computeRound(data: SelfAttentionData, heads: number): AttentionRound {
  const n = data.tokens.length;
  const dm = data.wq.length;
  if (!data.headsLadder.includes(heads)) throw new Error(`self-attention: 머리 수 ${heads} 는 사다리 밖이다`);
  const dk = dm / heads;
  const sqrtDk = Math.sqrt(dk);
  const q = projectAll(data.x, data.wq);
  const k = projectAll(data.x, data.wk);
  const v = projectAll(data.x, data.wv);
  const raw: number[][][] = [];
  const score: number[][][] = [];
  const weights: number[][][] = [];
  const picks: HeadPick[][] = [];
  const result: number[][] = q.map(() => new Array<number>(dm).fill(0));
  let clear = 0;
  let tied = 0;
  let topLow = Infinity;
  for (let h = 0; h < heads; h += 1) {
    const rawH: number[][] = [];
    const scoreH: number[][] = [];
    const weightH: number[][] = [];
    const pickH: HeadPick[] = [];
    for (let i = 0; i < n; i += 1) {
      const rowRaw: number[] = [];
      for (let j = 0; j < n; j += 1) {
        let s = 0;
        for (let c = 0; c < dk; c += 1) s += q[i]![h * dk + c]! * k[j]![h * dk + c]!;
        rowRaw.push(s);
      }
      const rawMax = Math.max(...rowRaw);
      const exps = rowRaw.map((r) => Math.exp((r - rawMax) / sqrtDk));
      let total = 0;
      for (const e of exps) total += e;
      const rowW = exps.map((e) => e / total);
      const keys: number[] = [];
      rowRaw.forEach((r, j) => {
        if (r === rawMax) keys.push(j);
      });
      const isTied = keys.length > 1;
      if (isTied) tied += 1;
      else clear += 1;
      topLow = Math.min(topLow, Math.max(...rowW));
      for (let c = 0; c < dk; c += 1) {
        let acc = 0;
        for (let j = 0; j < n; j += 1) acc += rowW[j]! * v[j]![h * dk + c]!;
        result[i]![h * dk + c] = acc;
      }
      rawH.push(rowRaw);
      scoreH.push(rowRaw.map((r) => r / sqrtDk));
      weightH.push(rowW);
      pickH.push({ keys, tied: isTied });
    }
    raw.push(rawH);
    score.push(scoreH);
    weights.push(weightH);
    picks.push(pickH);
  }
  let valueMax = 0;
  for (const row of v) for (const cell of row) valueMax = Math.max(valueMax, Math.abs(cell));
  if (valueMax === 0) throw new Error('self-attention: v 가 모두 0 이라 결과 축을 셀 수 없다');
  return {
    heads,
    dk,
    sqrtDk,
    q,
    k,
    v,
    raw,
    score,
    weights,
    picks,
    clear,
    tied,
    rows: heads * n,
    topLow,
    result,
    valueMax,
    weightCount: 3 * dm * dm,
  };
}

export async function selfAttentionAlgorithm(ctx: FacetContext<SelfAttentionData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SelfAttentionData>;
  const data = readSelfAttentionData(ctx.data);
  const maxHeads = Math.max(...data.headsLadder);

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const showMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    const delta = prev === undefined ? value : value - prev;
    if (prev === undefined || delta !== 0) ctx.metric(name, delta);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판을 끝까지 재생한다. 취소되면 false. */
  const playRound = async (heads: number): Promise<boolean> => {
    const r = computeRound(data, heads);
    // 걸음 0 — 판 틀과 x. 앞 판의 결론은 무대가 걷는다.
    await ctx.emit({
      type: 'frame',
      payload: { tokens: data.tokens, x: data.x, heads, dk: r.dk, sqrtDk: r.sqrtDk, maxHeads },
    });
    showMetric('clear-rows', 0);
    showMetric('tied-rows', 0);
    showMetric('weight-count', 0);
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 1 — 투영
    if (ctx.cancelled) return false;
    await phase('project');
    await ctx.emit({ type: 'project', payload: { q: r.q, k: r.k, v: r.v } });
    showMetric('weight-count', r.weightCount);
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 2 — 점수
    if (ctx.cancelled) return false;
    await phase('score');
    await ctx.emit({ type: 'score', payload: { raw: r.raw, score: r.score } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 3 — 무게
    if (ctx.cancelled) return false;
    await phase('softmax');
    await ctx.emit({ type: 'softmax', payload: { weights: r.weights, topLow: r.topLow } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 4 — 짝 가리기
    if (ctx.cancelled) return false;
    await phase('pick');
    await ctx.emit({ type: 'pick', payload: { picks: r.picks, clear: r.clear, tied: r.tied, rows: r.rows } });
    showMetric('clear-rows', r.clear);
    showMetric('tied-rows', r.tied);
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 5 — 결과 (다음 걸음 경계는 입력 대기)
    if (ctx.cancelled) return false;
    await phase('mix');
    await ctx.emit({ type: 'mix', payload: { result: r.result, valueMax: r.valueMax } });
    return !ctx.cancelled;
  };

  /** 손잡이 값을 기다린다. 취소되면 null. */
  const nextHeads = async (): Promise<number | null> => {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'heads') continue;
      // 우리 손잡이의 입력이 어긋난 모양이면 던진다 (C6)
      const p = input.payload;
      if (typeof p !== 'object' || p === null) throw new Error('self-attention: heads 입력에 payload 가 없다');
      const value = (p as { value?: unknown }).value;
      if (typeof value !== 'number' || !data.headsLadder.includes(value)) {
        throw new Error(`self-attention: heads 입력 ${String(value)} 는 사다리 밖이다`);
      }
      return value;
    }
  };

  try {
    let heads = data.heads;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(heads))) return;
      const next = await nextHeads();
      if (next === null) return;
      heads = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
