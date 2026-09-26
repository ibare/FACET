/**
 * 펼친 RNN 과 시간 역전파 — 같은 되먹임 무게 w_h 하나가 앞으로는 첫 입력의 흔적을,
 * 뒤로는 끝에서 거슬러 가는 기울기를 같은 곱 w_h·(1 − h_t²) 으로 줄이는 것을 보인다.
 *
 * 셈 (irs.ts 의 IR 과 같은 차례 · 같은 식):
 *   셀        h_t = tanhExp(w_x·x_t + w_h·h_{t−1} + b), h_0 = data.h0, t = 1..T
 *   tanhExp   e = exp(−2·|a|) · r = (1 − e) / (1 + e) · a < 0 이면 −r
 *   흔적      s_1 = w_x·(1 − h_1²) · s_t = s_{t−1}·w_h·(1 − h_t²) — "곱한 몫" 은 w_h·(1 − h_t²)
 *   뒤로      g_T = 1 (끝 출력 h_T 자체의 기울기 · 손실 없음) · k = T → 1 차례로
 *             d_k = g_k·(1 − h_k²) · 몫 c_k = d_k·x_k · 모인 합 G += c_k · g_{k−1} = d_k·w_h
 *   먼 절반   Σ_{2k ≤ T} |c_k| ÷ Σ_k |c_k| (k = T → 1 차례로 더한다)
 *   뒤로 닿은 ∂h_T/∂x_1 = d_1·w_x — 앞으로 잰 s_T 와 **따로** 셈해 나란히 보낸다
 *
 * 동률 규칙: 판정하는 비교가 없다 (정렬 · 최댓값 고르기 없음). 먼 절반의 경계는 정수 2k ≤ T.
 *
 * 이벤트 (payload 의 수는 배정도 그대로 — 자르는 것은 stage 의 표시뿐):
 *   init      silent  { xs: number[], wx, b, h0, wh, steps, sum }       판 머리 · 걸음 0 을 갈아 끼운다
 *                     sum = 아직 아무 몫도 보태지 않은 모인 합 0
 *   phase     silent  { phase: 'forward' | 'backward' | 'far-share' }
 *   forward           { tIndex, x, a, h, trace, mult: number | null, left }
 *                     mult 는 t ≥ 2 에서 w_h·(1 − h_t²), t = 1 은 null · left = s_t / s_1 의 정수 %
 *   backward          { k, x, reach, slope, d, contrib, sum }
 *                     reach = ∂h_T/∂h_k · slope = 1 − h_k² · d = reach·slope · contrib = d·x_k · sum = 모인 합
 *   far-share         { forwardTrace, backwardTrace, reachFirst, share, farCount, sum }
 *                     farCount = 먼 절반에 드는 셀 수 (2k ≤ T 인 k 의 개수)
 *
 * phase 어휘: forward (걸음 1..T) · backward (걸음 T+1..2T) · far-share (걸음 2T+1). 걸음 0 은 phase 없음.
 *
 * 계기 (정수만):
 *   trace-left  흔적 남은 비 s_t / s_1 의 정수 % — 걸음 0 에 0, 앞으로 걸음마다 그 값, 이후 그대로
 *   far-share   먼 절반의 몫의 정수 % — 걸음 2T+1 에만 값, 그 전에는 0
 *
 * 손잡이: `wh` — payload.value 가 whLadder 에 든 수일 때만 받는다. 받으면 처음부터 다시 한 판.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type UnrolledRnnData = {
  type: 'unrolled-rnn';
  stepMs: number;
  xs: number[];
  wx: number;
  b: number;
  h0: number;
  whLadder: number[];
  wh: number;
};

function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`[unrolled-rnn] ${what} 가 수가 아니다: ${String(v)}`);
  }
  return v;
}

function numberList(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`[unrolled-rnn] ${what} 가 비었거나 목록이 아니다`);
  }
  return v.map((item, i) => finite(item, `${what}[${i}]`));
}

/** ctx.data 의 좁히개 — 모양이 어긋나면 던진다. */
export function readUnrolledRnnData(raw: unknown): UnrolledRnnData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('[unrolled-rnn] data 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'unrolled-rnn') {
    throw new Error(`[unrolled-rnn] data.type 이 다르다: ${String(r.type)}`);
  }
  const whLadder = numberList(r.whLadder, 'whLadder');
  const wh = finite(r.wh, 'wh');
  if (!whLadder.includes(wh)) {
    throw new Error(`[unrolled-rnn] 기본 wh ${wh} 가 사다리에 없다`);
  }
  const stepMs = finite(r.stepMs, 'stepMs');
  if (stepMs <= 0) throw new Error('[unrolled-rnn] stepMs 는 양수여야 한다');
  return {
    type: 'unrolled-rnn',
    stepMs,
    xs: numberList(r.xs, 'xs'),
    wx: finite(r.wx, 'wx'),
    b: finite(r.b, 'b'),
    h0: finite(r.h0, 'h0'),
    whLadder,
    wh,
  };
}

/** IR 의 tanhExp 와 같은 식. Math.tanh 를 쓰지 않는다 — 코드 패널과 끝자리까지 맞춘다. */
export function tanhExp(a: number): number {
  const e = Math.exp(-2 * Math.abs(a));
  const r = (1 - e) / (1 + e);
  if (a < 0) return -r;
  return r;
}

export type ForwardPass = {
  /** hs[0] = h0, hs[t] = h_t (t = 1..T) */
  hs: number[];
  /** pre[t] = a_t (pre[0] 은 쓰지 않음) */
  pre: number[];
  /** trace[t] = s_t = ∂h_t/∂x_1 (trace[0] 은 쓰지 않음) */
  trace: number[];
};

/** IR `forward` 와 같은 차례. */
export function unrolledForward(xs: number[], wx: number, wh: number, b: number, h0: number): ForwardPass {
  const steps = xs.length;
  const hs: number[] = new Array<number>(steps + 1).fill(0);
  const pre: number[] = new Array<number>(steps + 1).fill(0);
  const trace: number[] = new Array<number>(steps + 1).fill(0);
  hs[0] = h0;
  for (let step = 1; step <= steps; step += 1) {
    const a = wx * xs[step - 1]! + wh * hs[step - 1]! + b;
    const h = tanhExp(a);
    pre[step] = a;
    hs[step] = h;
    if (step === 1) {
      trace[step] = wx * (1 - h * h);
    } else {
      trace[step] = trace[step - 1]! * wh * (1 - h * h);
    }
  }
  return { hs, pre, trace };
}

export type BackwardRow = { k: number; reach: number; slope: number; d: number; contrib: number; sum: number };

export type BackwardPass = {
  /** k = T → 1 차례의 걸음들 */
  rows: BackwardRow[];
  /** contrib[k] = d_k·x_k (contrib[0] 은 쓰지 않음) */
  contrib: number[];
};

/** IR `backward` 와 같은 차례 (i = 0..T−1, k = T − i). 모인 합은 같은 차례로 더한다. */
export function unrolledBackward(xs: number[], hs: number[], wh: number): BackwardPass {
  const steps = xs.length;
  const contrib: number[] = new Array<number>(steps + 1).fill(0);
  const rows: BackwardRow[] = [];
  let g = 1;
  let sum = 0;
  for (let i = 0; i < steps; i += 1) {
    const k = steps - i;
    const h = hs[k]!;
    const slope = 1 - h * h;
    const d = g * slope;
    const c = d * xs[k - 1]!;
    contrib[k] = c;
    sum = sum + c;
    rows.push({ k, reach: g, slope, d, contrib: c, sum });
    g = d * wh;
  }
  return { rows, contrib };
}

/** IR `farShare` 의 끝 부분과 같은 차례 — k = T → 1 로 절댓값을 더한다. */
export function farShareOf(contrib: number[], steps: number): number {
  let far = 0;
  let total = 0;
  for (let i = 0; i < steps; i += 1) {
    const k = steps - i;
    total = total + Math.abs(contrib[k]!);
    if (k * 2 <= steps) {
      far = far + Math.abs(contrib[k]!);
    }
  }
  if (total === 0) throw new Error('[unrolled-rnn] 몫의 절댓값 합이 0 — 먼 절반의 몫을 셈할 수 없다');
  return far / total;
}

/** 실수 몫의 정수 % — (x·100).toFixed(0). */
export function percentOf(x: number): number {
  return Number((x * 100).toFixed(0));
}

type Metrics = { 'trace-left': number; 'far-share': number };

export async function unrolledRnnAlgorithm(base: FacetContext<UnrolledRnnData>): Promise<void> {
  const ctx = base as ReactiveContext<UnrolledRnnData>;
  const data = readUnrolledRnnData(ctx.data);
  const steps = data.xs.length;
  const shown: Metrics = { 'trace-left': 0, 'far-share': 0 };
  /** 지금 보이는 값을 들고 차이만 보낸다 — 차이가 0 이어도 보낸다. */
  const setMetric = (name: keyof Metrics, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판 — 끝까지 돌았으면 true, 취소되면 false. */
  const playRound = async (wh: number): Promise<boolean> => {
    const fwd = unrolledForward(data.xs, data.wx, wh, data.b, data.h0);
    const bwd = unrolledBackward(data.xs, fwd.hs, wh);
    const share = farShareOf(bwd.contrib, steps);
    const first = bwd.rows[bwd.rows.length - 1];
    if (first === undefined || first.k !== 1) throw new Error('[unrolled-rnn] 뒤로 가는 걸음이 t1 에 닿지 않았다');
    const s1 = fwd.trace[1]!;
    if (s1 === 0) throw new Error('[unrolled-rnn] s_1 이 0 — 흔적 남은 비를 셈할 수 없다');

    setMetric('trace-left', 0);
    setMetric('far-share', 0);
    await ctx.emit({
      type: 'init',
      payload: { xs: [...data.xs], wx: data.wx, b: data.b, h0: data.h0, wh, steps, sum: 0 },
      silent: true,
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    for (let step = 1; step <= steps; step += 1) {
      if (ctx.cancelled) return false;
      const h = fwd.hs[step]!;
      const left = percentOf(fwd.trace[step]! / s1);
      await phase('forward');
      await ctx.emit({
        type: 'forward',
        payload: {
          tIndex: step,
          x: data.xs[step - 1]!,
          a: fwd.pre[step]!,
          h,
          trace: fwd.trace[step]!,
          mult: step === 1 ? null : wh * (1 - h * h),
          left,
        },
      });
      setMetric('trace-left', left);
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    for (const row of bwd.rows) {
      if (ctx.cancelled) return false;
      await phase('backward');
      await ctx.emit({
        type: 'backward',
        payload: {
          k: row.k,
          x: data.xs[row.k - 1]!,
          reach: row.reach,
          slope: row.slope,
          d: row.d,
          contrib: row.contrib,
          sum: row.sum,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    if (ctx.cancelled) return false;
    const pct = percentOf(share);
    await phase('far-share');
    await ctx.emit({
      type: 'far-share',
      payload: {
        forwardTrace: fwd.trace[steps]!,
        backwardTrace: first.d * data.wx,
        reachFirst: first.reach,
        share,
        farCount: Math.floor(steps / 2),
        sum: first.sum,
      },
    });
    setMetric('far-share', pct);
    return true;
  };

  /** 손잡이 입력을 기다린다 — 사다리에 든 값을 받거나, 취소되면 null. */
  const awaitKnob = async (): Promise<number | null> => {
    while (!ctx.cancelled) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'wh') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('[unrolled-rnn] wh 입력의 payload 가 객체가 아니다');
      }
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number' || !data.whLadder.includes(value)) {
        throw new Error(`[unrolled-rnn] wh 입력 값이 사다리에 없다: ${String(value)}`);
      }
      return value;
    }
    return null;
  };

  try {
    let wh = data.wh;
    while (!ctx.cancelled) {
      if (!(await playRound(wh))) return;
      const next = await awaitKnob();
      if (next === null) return;
      wh = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
