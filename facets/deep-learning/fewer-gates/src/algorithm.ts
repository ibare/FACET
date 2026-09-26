/**
 * fewer-gates — LSTM 과 GRU 가 같은 입력을 함께 받아 한 걸음씩 나아간다.
 *
 * LSTM 은 남길 몫 f 와 들일 몫 i 를 따로 셈하고 셀 c 와 h 둘을 넘긴다.
 * GRU 는 문 z 하나로 지킬 몫 z 와 들일 몫 1 − z 를 함께 정하고 h 하나만 넘긴다.
 *
 * 식 (칸 하나)
 *   σ(a) = 1 / (1 + e^(−a)), 칸마다 a = w_x·x + w_h·h_{t-1} + b
 *   LSTM  f · i · o = σ(…) · g = tanh(…) · c_t = f·c_{t-1} + i·g · h_t = o·tanh(c_t)
 *   GRU   z · r = σ(…) · h̃ = tanh(w_x·x + w_h·(r·h_{t-1}) + b) · h_t = z·h_{t-1} + (1 − z)·h̃
 *
 * 이벤트 (silent 인 것은 없다)
 *   step  payload {
 *     k: number,                         // 걸음 번호 (1 부터)
 *     x: number,                         // 이번 입력
 *     lstm: { f, i, g, o, cPrev, c, kept, taken, hPrev, h, sum },
 *                                        // kept = f·c_{t-1}, taken = i·g, sum = f + i
 *     gru:  { z, rest, r, cand, hPrev, h, kept, taken, sum },
 *                                        // rest = 1 − z, kept = z·h_{t-1}, taken = (1 − z)·h̃, sum = z + rest
 *     evals: { lstm: number, gru: number } // 지금까지 문을 셈한 횟수 (σ 를 지난 칸)
 *   }  (모든 필드는 number)
 *
 * 문의 수 · 넘기는 상태의 수 · 무게의 수는 모형의 모양에서 센다 (`modelShape`).
 * 장면이 같은 셈을 쓰도록 export 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Unit = { wx: number; wh: number; b: number };

export type FewerGatesFacetData = {
  type: 'fewer-gates';
  stepMs: number;
  inputs: number[];
  lstm: { name: string; c0: number; h0: number; f: Unit; i: Unit; g: Unit; o: Unit };
  gru: { name: string; h0: number; z: Unit; r: Unit; cand: Unit };
  symbols: {
    x: string;
    c: string;
    h: string;
    f: string;
    i: string;
    g: string;
    o: string;
    z: string;
    rest: string;
    r: string;
    cand: string;
  };
};

/** 모형 하나의 짜임 — 문(σ 를 지나는 칸) · 후보(tanh 칸) · 넘기는 상태 */
const LSTM_GATES = ['f', 'i', 'o'] as const;
const LSTM_CANDS = ['g'] as const;
const LSTM_STATES = ['c0', 'h0'] as const;
const GRU_GATES = ['z', 'r'] as const;
const GRU_CANDS = ['cand'] as const;
const GRU_STATES = ['h0'] as const;

export type Shape = { gates: number; states: number; weights: number };

function weightsOf(u: Unit): number {
  return Object.keys(u).length;
}

/** 문의 수 · 넘기는 상태의 수 · 무게의 수 (칸마다 w_x · w_h · b) */
export function modelShape(data: FewerGatesFacetData): { lstm: Shape; gru: Shape } {
  const lstmUnits = [...LSTM_GATES, ...LSTM_CANDS].map((k) => data.lstm[k]);
  const gruUnits = [...GRU_GATES, ...GRU_CANDS].map((k) => data.gru[k]);
  return {
    lstm: {
      gates: LSTM_GATES.length,
      states: LSTM_STATES.length,
      weights: lstmUnits.reduce((s, u) => s + weightsOf(u), 0),
    },
    gru: {
      gates: GRU_GATES.length,
      states: GRU_STATES.length,
      weights: gruUnits.reduce((s, u) => s + weightsOf(u), 0),
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readNum(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`fewer-gates: ${where}.${key} 는 유한한 수여야 한다`);
  }
  return v;
}

function readStr(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') {
    throw new Error(`fewer-gates: ${where}.${key} 는 빈 문자열이 아닌 글자여야 한다`);
  }
  return v;
}

function readRec(o: Record<string, unknown>, key: string, where: string): Record<string, unknown> {
  const v = o[key];
  if (!isRecord(v)) throw new Error(`fewer-gates: ${where}.${key} 가 객체가 아니다`);
  return v;
}

function readUnit(o: Record<string, unknown>, key: string, where: string): Unit {
  const u = readRec(o, key, where);
  const at = `${where}.${key}`;
  const keys = Object.keys(u).sort().join(',');
  if (keys !== 'b,wh,wx') throw new Error(`fewer-gates: ${at} 의 무게는 wx · wh · b 셋이어야 한다 (받은 것: ${keys})`);
  return { wx: readNum(u, 'wx', at), wh: readNum(u, 'wh', at), b: readNum(u, 'b', at) };
}

/** initialData 좁히개 — 모양이 어긋나면 던진다 */
export function readFewerGatesData(raw: unknown): FewerGatesFacetData {
  if (!isRecord(raw)) throw new Error('fewer-gates: initialData 가 객체가 아니다');
  if (raw['type'] !== 'fewer-gates') throw new Error('fewer-gates: initialData.type 이 fewer-gates 가 아니다');
  const stepMs = readNum(raw, 'stepMs', 'initialData');
  const inputsRaw = raw['inputs'];
  if (!Array.isArray(inputsRaw) || inputsRaw.length === 0) {
    throw new Error('fewer-gates: initialData.inputs 는 비지 않은 배열이어야 한다');
  }
  const inputs = inputsRaw.map((v, n) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`fewer-gates: inputs[${n}] 가 수가 아니다`);
    return v;
  });
  const l = readRec(raw, 'lstm', 'initialData');
  const g = readRec(raw, 'gru', 'initialData');
  const s = readRec(raw, 'symbols', 'initialData');
  const sw = 'initialData.symbols';
  return {
    type: 'fewer-gates',
    stepMs,
    inputs,
    lstm: {
      name: readStr(l, 'name', 'lstm'),
      c0: readNum(l, 'c0', 'lstm'),
      h0: readNum(l, 'h0', 'lstm'),
      f: readUnit(l, 'f', 'lstm'),
      i: readUnit(l, 'i', 'lstm'),
      g: readUnit(l, 'g', 'lstm'),
      o: readUnit(l, 'o', 'lstm'),
    },
    gru: {
      name: readStr(g, 'name', 'gru'),
      h0: readNum(g, 'h0', 'gru'),
      z: readUnit(g, 'z', 'gru'),
      r: readUnit(g, 'r', 'gru'),
      cand: readUnit(g, 'cand', 'gru'),
    },
    symbols: {
      x: readStr(s, 'x', sw),
      c: readStr(s, 'c', sw),
      h: readStr(s, 'h', sw),
      f: readStr(s, 'f', sw),
      i: readStr(s, 'i', sw),
      g: readStr(s, 'g', sw),
      o: readStr(s, 'o', sw),
      z: readStr(s, 'z', sw),
      rest: readStr(s, 'rest', sw),
      r: readStr(s, 'r', sw),
      cand: readStr(s, 'cand', sw),
    },
  };
}

function sigma(a: number): number {
  return 1 / (1 + Math.exp(-a));
}

function pre(u: Unit, x: number, hIn: number): number {
  return u.wx * x + u.wh * hIn + u.b;
}

export async function fewerGates(ctx: FacetContext<FewerGatesFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FewerGatesFacetData>;
  const data = readFewerGatesData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const L = data.lstm;
  const G = data.gru;
  let c = L.c0;
  let hl = L.h0;
  let hg = G.h0;
  let evalsL = 0;
  let evalsG = 0;

  for (let n = 0; n < data.inputs.length; n += 1) {
    // 걸음 0 은 이미 두 모형과 처음 상태가 선 화면이라, 첫 발신 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const x = data.inputs[n];
    if (x === undefined) throw new Error(`fewer-gates: inputs[${n}] 가 없다`);

    // LSTM — 문 셋은 따로 셈한다
    const f = sigma(pre(L.f, x, hl));
    const i = sigma(pre(L.i, x, hl));
    const o = sigma(pre(L.o, x, hl));
    const g = Math.tanh(pre(L.g, x, hl));
    const cKept = f * c;
    const cTaken = i * g;
    const cNext = cKept + cTaken;
    const hlNext = o * Math.tanh(cNext);
    evalsL += LSTM_GATES.length;

    // GRU — 문 z 하나가 두 몫을 함께 정한다
    const z = sigma(pre(G.z, x, hg));
    const r = sigma(pre(G.r, x, hg));
    const rest = 1 - z;
    const cand = Math.tanh(pre(G.cand, x, r * hg));
    const gKept = z * hg;
    const gTaken = rest * cand;
    const hgNext = gKept + gTaken;
    evalsG += GRU_GATES.length;

    await ctx.emit({
      type: 'step',
      payload: {
        k: n + 1,
        x,
        lstm: { f, i, g, o, cPrev: c, c: cNext, kept: cKept, taken: cTaken, hPrev: hl, h: hlNext, sum: f + i },
        gru: { z, rest, r, cand, hPrev: hg, h: hgNext, kept: gKept, taken: gTaken, sum: z + rest },
        evals: { lstm: evalsL, gru: evalsG },
      },
    });

    c = cNext;
    hl = hlNext;
    hg = hgNext;
  }
}
