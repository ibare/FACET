/**
 * unroll-then-backprop — 펼쳐 놓고 뒤로 흘린다 (시간 역전파).
 *
 * 칸 하나짜리 RNN 셀 h_t = tanh(w_x·x_t + w_h·h_{t-1} + b) 를 입력 수만큼 펼쳐 앞으로 한 번
 * 흘리고, 마지막 걸음의 손실 L = ½·(h_T − y)² 에서 기울기를 첫 걸음 쪽으로 거슬러 보내며
 * 걸음마다 **같은 무게 w_x** 의 기울기 한 칸에 제 몫(d_t·x_t)을 보탠다. 무게는 고치지 않는다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (펼친 셀 · 무게 · 입력). init 이벤트는 없다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나다)
 *   forward   { t: number, h: number }
 *             t = 1..T. 셀 t 가 셈한 은닉 상태 h_t
 *   loss      { loss: number, delta: number }
 *             손실 L 과 마지막 걸음으로 들어가는 기울기 δ_T = h_T − y
 *   backward  { t: number, delta: number, slope: number, d: number, share: number, sum: number }
 *             t = T..1. δ_t (이 걸음 h 로 들어온 기울기) · slope = 1 − h_t² · d = δ_t·slope ·
 *             share = d·x_t (w_x 에 보탤 몫) · sum = 지금까지 모인 w_x 의 기울기
 *
 * 셈은 끝까지 배정도 실수로 하고 표시만 자른다 (`formatValue`).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 화면에 기호로 뜨는 글자 — 번역하지 않는 자료. */
export type UnrollSymbols = {
  x: string;
  h: string;
  wx: string;
  wh: string;
  b: string;
  y: string;
  loss: string;
  delta: string;
  slope: string;
  grad: string;
  tanh: string;
  step: string;
};

export type UnrollThenBackpropFacetData = {
  type: 'unroll-then-backprop';
  /** 입력 차례 x_1..x_T (칸 하나라 걸음마다 수 하나) */
  xs: number[];
  wx: number;
  wh: number;
  b: number;
  h0: number;
  /** 마지막 걸음의 목표 */
  y: number;
  stepMs: number;
  symbols: UnrollSymbols;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(raw: Record<string, unknown>, key: string): number {
  const v = raw[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`unroll-then-backprop: ${key} 가 유한한 수가 아니다`);
  }
  return v;
}

/** initialData 좁히개 — 모양이 어긋나면 던진다. 알고리즘과 장면이 함께 쓴다. */
export function narrowUnrollData(raw: unknown): UnrollThenBackpropFacetData {
  if (!isRecord(raw)) throw new Error('unroll-then-backprop: 자료가 객체가 아니다');
  if (raw['type'] !== 'unroll-then-backprop') {
    throw new Error(`unroll-then-backprop: 모르는 자료 종류 ${String(raw['type'])}`);
  }
  const xsRaw = raw['xs'];
  if (!Array.isArray(xsRaw) || xsRaw.length === 0) {
    throw new Error('unroll-then-backprop: 입력 xs 가 비었거나 배열이 아니다');
  }
  const xs = xsRaw.map((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`unroll-then-backprop: xs[${i}] 가 유한한 수가 아니다`);
    }
    return v;
  });
  const symRaw = raw['symbols'];
  if (!isRecord(symRaw)) throw new Error('unroll-then-backprop: symbols 가 없다');
  const symbol = (key: keyof UnrollSymbols): string => {
    const v = symRaw[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`unroll-then-backprop: 기호 ${key} 가 없다`);
    }
    return v;
  };
  const symbols: UnrollSymbols = {
    x: symbol('x'),
    h: symbol('h'),
    wx: symbol('wx'),
    wh: symbol('wh'),
    b: symbol('b'),
    y: symbol('y'),
    loss: symbol('loss'),
    delta: symbol('delta'),
    slope: symbol('slope'),
    grad: symbol('grad'),
    tanh: symbol('tanh'),
    step: symbol('step'),
  };
  const stepMs = finite(raw, 'stepMs');
  if (stepMs <= 0) throw new Error('unroll-then-backprop: stepMs 는 0 보다 커야 한다');
  return {
    type: 'unroll-then-backprop',
    xs,
    wx: finite(raw, 'wx'),
    wh: finite(raw, 'wh'),
    b: finite(raw, 'b'),
    h0: finite(raw, 'h0'),
    y: finite(raw, 'y'),
    stepMs,
    symbols,
  };
}

/** 표시 규칙 — 셈한 값은 소수 둘째 자리까지만 보인다. `-0.00` 은 0.00 으로. */
export function formatValue(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

/** 1차 데이터(입력 · 무게 · 목표)는 적힌 모양 그대로. */
export function formatGiven(v: number): string {
  return Object.is(v, -0) ? '0' : String(v);
}

/** 앞으로 한 번 — h_1..h_T. */
export function forwardPass(data: UnrollThenBackpropFacetData): number[] {
  const hs: number[] = [];
  let prev = data.h0;
  for (const x of data.xs) {
    const h = Math.tanh(data.wx * x + data.wh * prev + data.b);
    hs.push(h);
    prev = h;
  }
  return hs;
}

export async function unrollThenBackprop(
  ctx0: FacetContext<UnrollThenBackpropFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<UnrollThenBackpropFacetData>;
  const data = narrowUnrollData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const hs = forwardPass(data);
  const count = hs.length;

  // 걸음 0 이 이미 읽을 것(펼친 셀 넷 · 무게 · 입력)이 있는 화면이라 첫 발신 앞에도 문을 둔다.
  for (let i = 0; i < count; i += 1) {
    if (!(await pause())) return;
    const h = hs[i];
    if (h === undefined) throw new Error(`unroll-then-backprop: h${i + 1} 를 셈하지 못했다`);
    await ctx.emit({ type: 'forward', payload: { t: i + 1, h } });
  }

  const last = hs[count - 1];
  if (last === undefined) throw new Error('unroll-then-backprop: 마지막 은닉 상태가 없다');
  const loss = 0.5 * (last - data.y) ** 2;
  let delta = last - data.y;
  if (!(await pause())) return;
  await ctx.emit({ type: 'loss', payload: { loss, delta } });

  let sum = 0;
  for (let i = count - 1; i >= 0; i -= 1) {
    if (!(await pause())) return;
    const h = hs[i];
    const x = data.xs[i];
    if (h === undefined || x === undefined) {
      throw new Error(`unroll-then-backprop: 걸음 ${i + 1} 의 h 또는 x 가 없다`);
    }
    const slope = 1 - h * h;
    const d = delta * slope;
    const share = d * x;
    sum += share;
    await ctx.emit({
      type: 'backward',
      payload: { t: i + 1, delta, slope, d, share, sum },
    });
    delta = d * data.wh;
  }
}
