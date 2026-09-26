/**
 * carry-hidden-state — 걸음마다 방금 만든 은닉 상태 h 가 다음 걸음으로 넘겨진다.
 *
 * 셀: h_t = tanh(w_x·x_t + w_h·h_{t-1} + b). 은닉 상태는 한 칸(수 하나), 처음 h0 는 데이터.
 * 셈은 배정도 끝까지 하고, 표시는 그림이 자른다. 앞 걸음의 h 는 셈한 값 그대로 다음 걸음에 넘긴다.
 *
 * 이벤트
 *   step (silent 아님) — 토큰 하나를 셀에 넣은 한 걸음
 *     payload {
 *       t: number          걸음 번호 (1 부터)
 *       token: string      이번 토큰 이름 (데이터의 기호)
 *       x: number          토큰의 입력값
 *       prev: number       넘겨받은 h (h_{t-1})
 *       termX: number      w_x·x
 *       termH: number      w_h·h_{t-1}
 *       sum: number        termX + termH + b
 *       h: number          tanh(sum) — 새 h
 *       sameToken: number[]  이 토큰 뒤에 나온 h 전부 (지금까지, 이번 것 포함, 차례대로)
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (토큰 차례 · h0). init 이벤트는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CarrySymbols = {
  h: string;
  x: string;
  termX: string;
  termH: string;
  act: string;
};

export type CarryHiddenStateFacetData = {
  type: 'carry-hidden-state';
  stepMs: number;
  tokens: string[];
  inputs: Record<string, number>;
  weights: { wx: number; wh: number; b: number };
  h0: number;
  symbols: CarrySymbols;
};

function finiteOf(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`carry-hidden-state: ${where} 는 유한한 수여야 한다`);
  }
  return v;
}

function textOf(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`carry-hidden-state: ${where} 는 빈 글자가 아니어야 한다`);
  }
  return v;
}

function recordOf(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`carry-hidden-state: ${where} 는 객체여야 한다`);
  }
  return v as Record<string, unknown>;
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다 — 걸음이 줄어든 그림을 조용히 내지 않는다. */
export function readCarryData(raw: unknown): CarryHiddenStateFacetData {
  const r = recordOf(raw, 'initialData');
  if (r.type !== 'carry-hidden-state') {
    throw new Error('carry-hidden-state: initialData.type 이 다르다');
  }
  const stepMs = finiteOf(r.stepMs, 'stepMs');
  if (!Array.isArray(r.tokens) || r.tokens.length === 0) {
    throw new Error('carry-hidden-state: tokens 는 비지 않은 배열이어야 한다');
  }
  const tokens = r.tokens.map((v, i) => textOf(v, `tokens[${i}]`));
  const inputsRaw = recordOf(r.inputs, 'inputs');
  const inputs: Record<string, number> = {};
  for (const key of Object.keys(inputsRaw)) {
    inputs[key] = finiteOf(inputsRaw[key], `inputs.${key}`);
  }
  for (const tok of tokens) {
    if (!Object.prototype.hasOwnProperty.call(inputs, tok)) {
      throw new Error(`carry-hidden-state: 토큰 ${tok} 의 입력값이 없다`);
    }
  }
  const w = recordOf(r.weights, 'weights');
  const weights = {
    wx: finiteOf(w.wx, 'weights.wx'),
    wh: finiteOf(w.wh, 'weights.wh'),
    b: finiteOf(w.b, 'weights.b'),
  };
  const h0 = finiteOf(r.h0, 'h0');
  const s = recordOf(r.symbols, 'symbols');
  const symbols: CarrySymbols = {
    h: textOf(s.h, 'symbols.h'),
    x: textOf(s.x, 'symbols.x'),
    termX: textOf(s.termX, 'symbols.termX'),
    termH: textOf(s.termH, 'symbols.termH'),
    act: textOf(s.act, 'symbols.act'),
  };
  return { type: 'carry-hidden-state', stepMs, tokens, inputs, weights, h0, symbols };
}

/** 토큰의 입력값. 모르는 토큰이면 던진다. */
export function inputOf(data: CarryHiddenStateFacetData, token: string): number {
  if (!Object.prototype.hasOwnProperty.call(data.inputs, token)) {
    throw new Error(`carry-hidden-state: 모르는 토큰 ${token}`);
  }
  const x = data.inputs[token];
  if (x === undefined) throw new Error(`carry-hidden-state: 모르는 토큰 ${token}`);
  return x;
}

export async function carryHiddenState(
  ctxIn: FacetContext<CarryHiddenStateFacetData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<CarryHiddenStateFacetData>;
  const data = readCarryData(ctx.data);
  const { wx, wh, b } = data.weights;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  // 토큰마다 그 뒤에 나온 h 를 모은다 — 캡션이 이 값으로 말한다
  const after = new Map<string, number[]>();
  let carried = data.h0;

  for (let i = 0; i < data.tokens.length; i += 1) {
    // 걸음 0(토큰 차례 · h0)이 이미 읽을 화면이라 첫 걸음 앞에도 문을 둔다
    if (!(await pause())) return;
    const token = data.tokens[i];
    if (token === undefined) throw new Error(`carry-hidden-state: tokens[${i}] 가 없다`);
    const x = inputOf(data, token);
    const termX = wx * x;
    const termH = wh * carried;
    const sum = termX + termH + b;
    const h = Math.tanh(sum);
    const list = [...(after.get(token) ?? []), h];
    after.set(token, list);

    await ctx.emit({
      type: 'step',
      payload: {
        t: i + 1,
        token,
        x,
        prev: carried,
        termX,
        termH,
        sum,
        h,
        sameToken: list,
      },
    });
    carried = h;
  }
}
