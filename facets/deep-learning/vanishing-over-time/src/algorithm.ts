/**
 * vanishing-over-time — 마지막 은닉 상태의 기울기가 한 걸음 거슬러 갈 때마다
 * 같은 w_h 와 그 걸음의 tanh 기울기를 곱한 몫만큼 줄어든다.
 *
 * 셀은 칸 하나짜리 기본 RNN: h_t = tanh(w_x·x_t + w_h·h_{t-1} + b), 처음 h0.
 * 기울기 ∂hN/∂h_k 는 ∂hN/∂hN = 1 에서 출발해
 *   ∂hN/∂h_{k-1} = ∂hN/∂h_k × w_h × (1 − h_k²)
 * 로 거슬러 간다. 더하는 칸도 손실도 무게 갱신도 없다.
 *
 * 발신 이벤트:
 *   - `init` (silent) — 걸음 0 의 바탕. 알고리즘이 셈한 h 차례와 출발 기울기.
 *       payload: { hs: number[]; start: number; wh: number; symbols: VanishingSymbols }
 *       hs[i] 는 h_{i+1} (h1..hN). start 는 ∂hN/∂hN = 1. wh 는 걸음마다 곱해지는 같은 무게.
 *       symbols 는 번역하지 않는 수식 기호 (h · ∂ · w_h · tanh′)
 *   - `back` — 한 걸음 거슬러 h_k 에 닿음 (k = N−1 → 1)
 *       payload: {
 *         k: number;          // 닿은 은닉 상태의 번호
 *         from: number;       // 거스르기 전 기울기 ∂hN/∂h_{k+1}
 *         slope: number;      // tanh 기울기 1 − h_{k+1}²
 *         factor: number;     // 곱한 몫 w_h × slope
 *         grad: number;       // 닿은 기울기 ∂hN/∂h_k
 *         distance: number;   // N − k
 *       }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type VanishingOverTimeFacetData = {
  type: 'vanishing-over-time';
  stepMs: number;
  xs: number[];
  wx: number;
  wh: number;
  b: number;
  h0: number;
  symbols: VanishingSymbols;
};

/** 번역하지 않는 수식 기호 — 데이터다. */
export type VanishingSymbols = {
  hidden: string;
  partial: string;
  wh: string;
  slope: string;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowSymbols(v: unknown): VanishingSymbols {
  if (typeof v !== 'object' || v === null) throw new Error('vanishing-over-time: symbols 가 없다');
  const s = v as Record<string, unknown>;
  const pick = (key: string): string => {
    const got = s[key];
    if (typeof got !== 'string' || got === '') {
      throw new Error(`vanishing-over-time: symbols.${key} 가 문자열이 아니다`);
    }
    return got;
  };
  return { hidden: pick('hidden'), partial: pick('partial'), wh: pick('wh'), slope: pick('slope') };
}

/** 자료를 좁힌다. 모양이 어긋나면 던진다. */
export function narrowVanishingData(raw: unknown): VanishingOverTimeFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('vanishing-over-time: 자료가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'vanishing-over-time') throw new Error('vanishing-over-time: type 이 다르다');
  const xs = d.xs;
  if (!Array.isArray(xs) || xs.length < 2 || !xs.every(isFiniteNumber)) {
    throw new Error('vanishing-over-time: 입력 xs 는 수 둘 이상의 배열이어야 한다');
  }
  for (const key of ['stepMs', 'wx', 'wh', 'b', 'h0'] as const) {
    if (!isFiniteNumber(d[key])) throw new Error(`vanishing-over-time: ${key} 가 수가 아니다`);
  }
  return {
    type: 'vanishing-over-time',
    stepMs: d.stepMs as number,
    xs: [...(xs as number[])],
    wx: d.wx as number,
    wh: d.wh as number,
    b: d.b as number,
    h0: d.h0 as number,
    symbols: narrowSymbols(d.symbols),
  };
}

/** 앞으로 펼쳐 h1..hN 을 셈한다. */
export function forwardHidden(data: VanishingOverTimeFacetData): number[] {
  const hs: number[] = [];
  let h = data.h0;
  for (const x of data.xs) {
    h = Math.tanh(data.wx * x + data.wh * h + data.b);
    hs.push(h);
  }
  return hs;
}

export async function vanishingOverTime(
  rawCtx: FacetContext<VanishingOverTimeFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<VanishingOverTimeFacetData>;
  const data = narrowVanishingData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const hs = forwardHidden(data);
  const n = hs.length;
  let grad = 1;

  // 걸음 0 — 바탕(h 차례)과 출발 기울기 1. 읽을 것이 있는 화면이라 다음 걸음 앞에 stepMs 를 둔다.
  await ctx.emit({ type: 'init', silent: true, payload: { hs: [...hs], start: grad, wh: data.wh, symbols: { ...data.symbols } } });

  for (let k = n - 1; k >= 1; k -= 1) {
    if (!(await pause())) return;
    const leaving = hs[k];
    if (leaving === undefined) throw new Error(`vanishing-over-time: h${k + 1} 가 셈되지 않았다`);
    const slope = 1 - leaving * leaving;
    const factor = data.wh * slope;
    const from = grad;
    grad = from * factor;
    await ctx.emit({
      type: 'back',
      payload: { k, from, slope, factor, grad, distance: n - k },
    });
  }
}
