/**
 * same-weights-each-step — 시간 축 가중치 공유.
 *
 * 은닉 상태 두 칸짜리 RNN 셀을 입력 다섯에 차례로 돌린다. 걸음마다 **같은 무게 한 벌**
 * (W_x · W_h · b) 이 다시 불려 나와 그 걸음의 셈에 쓰인다. 쓰인 횟수는 걸음마다 오르고,
 * 무게의 수는 무게의 모양에서 센 값에 머문다.
 *
 * 셀: a_i = W_x[i]·x + W_h[i][0]·h[0] + W_h[i][1]·h[1] + b[i] · h_i = tanh(a_i).
 * 셈은 배정도 그대로 다음 걸음에 넘긴다 (표시값을 넘기지 않는다).
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (무게 한 벌 · h0 · 입력 차례).
 * 걸음 0 에 이미 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 *
 * 이벤트 (silent 없음):
 *   - `step` — 입력 하나를 셈한 걸음
 *       payload: {
 *         k: number          // 걸음 번호 (1 부터)
 *         x: number          // 이 걸음의 입력
 *         hIn: number[]      // 받은 h (길이 = 은닉 칸 수)
 *         a: number[]        // tanh 앞의 합
 *         h: number[]        // 새 h
 *         uses: number       // 지금까지 무게 한 벌이 쓰인 횟수
 *         separate: number   // 걸음마다 따로 두었다면 필요했을 무게의 수 (무게의 수 × 쓰인 횟수)
 *       }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SameWeightsEachStepFacetData = {
  type: 'same-weights-each-step';
  stepMs: number;
  /** 수식 기호 — 번역하지 않는 자료 */
  symbols: { wx: string; wh: string; b: string; x: string; h: string; a: string };
  inputs: number[];
  h0: number[];
  wx: number[];
  wh: number[][];
  b: number[];
};

export type RnnWeights = { wx: number[]; wh: number[][]; b: number[] };

function isNumArr(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function field(o: object, key: string): unknown {
  return (o as Record<string, unknown>)[key];
}

/**
 * initialData 를 좁힌다. 이 조각의 자료가 아니거나 모양이 틀리면 던진다 —
 * 걸음이 줄어든 그림이나 빈 그림을 조용히 내지 않는다.
 */
export function readSameWeightsData(raw: unknown): SameWeightsEachStepFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('same-weights-each-step: initialData 가 객체가 아니다');
  if (field(raw, 'type') !== 'same-weights-each-step') {
    throw new Error('same-weights-each-step: initialData 의 type 이 이 조각의 것이 아니다');
  }
  const stepMs = field(raw, 'stepMs');
  const inputs = field(raw, 'inputs');
  const h0 = field(raw, 'h0');
  const wx = field(raw, 'wx');
  const wh = field(raw, 'wh');
  const b = field(raw, 'b');
  const symbols = field(raw, 'symbols');
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs)) throw new Error('same-weights-each-step: stepMs 가 수가 아니다');
  if (!isNumArr(inputs) || inputs.length === 0) throw new Error('same-weights-each-step: inputs 가 수 배열이 아니다');
  if (!isNumArr(h0) || h0.length === 0) throw new Error('same-weights-each-step: h0 가 수 배열이 아니다');
  const n = h0.length;
  if (!isNumArr(wx) || wx.length !== n) throw new Error(`same-weights-each-step: W_x 길이 ${String(isNumArr(wx) ? wx.length : 'NaN')} 가 은닉 칸 ${n} 과 다르다`);
  if (!isNumArr(b) || b.length !== n) throw new Error(`same-weights-each-step: b 길이가 은닉 칸 ${n} 과 다르다`);
  if (!Array.isArray(wh) || wh.length !== n || !wh.every((row) => isNumArr(row) && row.length === n)) {
    throw new Error(`same-weights-each-step: W_h 가 ${n}×${n} 이 아니다`);
  }
  if (typeof symbols !== 'object' || symbols === null) throw new Error('same-weights-each-step: symbols 가 없다');
  const symbol = (key: string): string => {
    const s = field(symbols, key);
    if (typeof s !== 'string' || s === '') throw new Error(`same-weights-each-step: 기호 ${key} 가 없다`);
    return s;
  };
  return {
    type: 'same-weights-each-step',
    stepMs,
    symbols: {
      wx: symbol('wx'),
      wh: symbol('wh'),
      b: symbol('b'),
      x: symbol('x'),
      h: symbol('h'),
      a: symbol('a'),
    },
    inputs: [...inputs],
    h0: [...h0],
    wx: [...wx],
    wh: (wh as number[][]).map((row) => [...row]),
    b: [...b],
  };
}

/** 무게의 수 — 무게의 모양에서 센다 (W_x 칸 + W_h 칸 + b 칸). */
export function weightCount(w: RnnWeights): number {
  return w.wx.length + w.wh.reduce((sum, row) => sum + row.length, 0) + w.b.length;
}

/** 셀 한 번 — 받은 h 와 입력 x 에서 a 와 새 h. */
export function cellStep(w: RnnWeights, x: number, hIn: readonly number[]): { a: number[]; h: number[] } {
  if (hIn.length !== w.wx.length) {
    throw new Error(`same-weights-each-step: 받은 h 길이 ${hIn.length} 가 무게 ${w.wx.length} 칸과 다르다`);
  }
  const a = w.wx.map((wxi, i) => {
    const row = w.wh[i];
    const bi = w.b[i];
    if (row === undefined || bi === undefined) throw new Error(`same-weights-each-step: 칸 ${i} 의 무게가 없다`);
    let sum = wxi * x + bi;
    for (let j = 0; j < hIn.length; j += 1) {
      const wij = row[j];
      const hj = hIn[j];
      if (wij === undefined || hj === undefined) throw new Error(`same-weights-each-step: W_h[${i}][${j}] 가 없다`);
      sum += wij * hj;
    }
    return sum;
  });
  return { a, h: a.map((v) => Math.tanh(v)) };
}

export async function sameWeightsEachStep(
  context: FacetContext<SameWeightsEachStepFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SameWeightsEachStepFacetData>;
  const data = readSameWeightsData(ctx.data);
  const weights: RnnWeights = { wx: data.wx, wh: data.wh, b: data.b };
  const count = weightCount(weights);

  const stepMs = data.stepMs;
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let h = [...data.h0];
  let uses = 0;
  for (const x of data.inputs) {
    if (!(await pause())) return;
    const out = cellStep(weights, x, h);
    uses += 1;
    await ctx.emit({
      type: 'step',
      payload: { k: uses, x, hIn: [...h], a: out.a, h: out.h, uses, separate: count * uses },
    });
    h = out.h;
  }
}
