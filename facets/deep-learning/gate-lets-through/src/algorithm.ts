/**
 * gateLetsThrough — LSTM 한 걸음(시각 하나)의 안쪽. 문 셋이 차례로 흐름에 곱해진다.
 *
 * 식 (칸 하나, 엿보기 구멍 없음):
 *   w·(k) = w_x·x + w_h·h_prev + b      (k = f · i · g · o)
 *   f = σ(w·f) · i = σ(w·i) · o = σ(w·o) · g = tanh(w·g)
 *   c = f·c_prev + i·g · h = o·tanh(c)
 *
 * 걸음 차례는 흐름의 차례다 — 잊기 → 후보 → 들이기 → 새 셀 → 내보내기.
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (x · h_prev · c_prev).
 * 첫 발신 앞에도 stepMs 를 둔다 — 걸음 0 에 이미 읽을 것이 있다.
 *
 * 이벤트 (모두 silent 아님, 순서대로 한 번씩):
 *   forget     { pre: number; f: number; kept: number; dropped: number }
 *              pre = w·(f), kept = f·c_prev, dropped = c_prev − kept (흘려보낸 몫)
 *   candidate  { pre: number; g: number }
 *   admit      { pre: number; i: number; admitted: number }       admitted = i·g
 *   combine    { kept: number; admitted: number; c: number }      c = kept + admitted
 *   output     { pre: number; o: number; tc: number; h: number }  tc = tanh(c), h = o·tc
 *
 * 모르는 문 식별자 · 빠진 문 · 무게 셋이 아닌 모양 · 수가 아닌 값은 던진다 (C6).
 * 이 그림은 흐름을 막대의 높이로 그리므로 음의 흐름(c_prev · g · c 가 0 아래)도 던진다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GateId = 'f' | 'i' | 'g' | 'o';
export type GateWeights = readonly [number, number, number];

export type GateLetsThroughFacetData = {
  type: 'gate-lets-through';
  stepMs: number;
  x: number;
  hPrev: number;
  cPrev: number;
  weights: Record<GateId, GateWeights>;
};

export const GATE_IDS: readonly GateId[] = ['f', 'i', 'g', 'o'];

/** 한 걸음 안쪽의 셈 전부. 알고리즘과 그림이 같은 함수를 부른다. */
export type GateStep = {
  preF: number;
  f: number;
  kept: number;
  dropped: number;
  preG: number;
  g: number;
  preI: number;
  i: number;
  admitted: number;
  c: number;
  preO: number;
  o: number;
  tc: number;
  h: number;
};

function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`gateLetsThrough: ${what} 가 유한한 수가 아니다 (${String(v)})`);
  }
  return v;
}

/** 넘겨받은 자료를 좁힌다. 모양이 틀리면 던진다. */
export function readGateData(raw: unknown): GateLetsThroughFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('gateLetsThrough: initialData 가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'gate-lets-through') throw new Error(`gateLetsThrough: 모르는 type (${String(d.type)})`);
  const w = d.weights;
  if (typeof w !== 'object' || w === null) throw new Error('gateLetsThrough: weights 가 없다');
  const wr = w as Record<string, unknown>;
  for (const key of Object.keys(wr)) {
    if (!(GATE_IDS as readonly string[]).includes(key)) {
      throw new Error(`gateLetsThrough: 모르는 문 식별자 (${key})`);
    }
  }
  const weights = {} as Record<GateId, GateWeights>;
  for (const id of GATE_IDS) {
    const triple = wr[id];
    if (!Array.isArray(triple) || triple.length !== 3) {
      throw new Error(`gateLetsThrough: 문 ${id} 의 무게는 (w_x, w_h, b) 셋이어야 한다`);
    }
    weights[id] = [
      finite(triple[0], `${id}.w_x`),
      finite(triple[1], `${id}.w_h`),
      finite(triple[2], `${id}.b`),
    ];
  }
  return {
    type: 'gate-lets-through',
    stepMs: finite(d.stepMs, 'stepMs'),
    x: finite(d.x, 'x'),
    hPrev: finite(d.hPrev, 'hPrev'),
    cPrev: finite(d.cPrev, 'cPrev'),
    weights,
  };
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** 교과서 식 그대로. 셈은 배정도 끝까지 — 표시값을 되넣지 않는다. */
export function computeGateStep(d: {
  x: number;
  hPrev: number;
  cPrev: number;
  weights: Record<GateId, GateWeights>;
}): GateStep {
  const pre = (id: GateId): number => {
    const [wx, wh, b] = d.weights[id];
    return wx * d.x + wh * d.hPrev + b;
  };
  if (d.cPrev < 0) throw new Error(`gateLetsThrough: c_prev 가 음수다 (${d.cPrev}) — 흐름을 높이로 그릴 수 없다`);
  const preF = pre('f');
  const f = sigmoid(preF);
  const kept = f * d.cPrev;
  const dropped = d.cPrev - kept;
  const preG = pre('g');
  const g = Math.tanh(preG);
  if (g < 0) throw new Error(`gateLetsThrough: 후보 g 가 음수다 (${g}) — 흐름을 높이로 그릴 수 없다`);
  const preI = pre('i');
  const i = sigmoid(preI);
  const admitted = i * g;
  const c = kept + admitted;
  const preO = pre('o');
  const o = sigmoid(preO);
  const tc = Math.tanh(c);
  const h = o * tc;
  return { preF, f, kept, dropped, preG, g, preI, i, admitted, c, preO, o, tc, h };
}

export async function gateLetsThrough(
  context: FacetContext<GateLetsThroughFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<GateLetsThroughFacetData>;
  const data = readGateData(ctx.data);
  const stepMs = data.stepMs;
  const s = computeGateStep(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'forget',
    payload: { pre: s.preF, f: s.f, kept: s.kept, dropped: s.dropped },
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'candidate', payload: { pre: s.preG, g: s.g } });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'admit',
    payload: { pre: s.preI, i: s.i, admitted: s.admitted },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'combine',
    payload: { kept: s.kept, admitted: s.admitted, c: s.c },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'output',
    payload: { pre: s.preO, o: s.o, tc: s.tc, h: s.h },
  });
}
