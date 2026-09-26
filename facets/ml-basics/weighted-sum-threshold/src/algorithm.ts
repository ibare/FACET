/**
 * weighted-sum-threshold — 퍼셉트론이 입력을 무게만큼 한 합에 싣고, 끝에 문턱과 한 번 견준다.
 *
 * 걸음 0 은 처음 모습(합 0 · 출력 0), 걸음 1~3 은 입력 하나씩 싣기, 걸음 4 는 견줌 한 번.
 * 도중의 합은 문턱과 견주지 않는다 — 출력은 견줌 걸음에서만 바뀐다.
 *
 * 이벤트 (type 은 리터럴):
 *   init     silent: true
 *            payload { sum: number; output: number;
 *                      axis: { lo: number; hi: number; ticks: { v: number; major: boolean }[] } }
 *            합의 출발점(0) · 출력의 출발값(0) · 합 눈금의 범위. 걸음 0 을 갈아 끼운다
 *   load     silent 아님 — 걸음 하나
 *            payload { index: number; product: number; from: number; to: number }
 *            index 번째 입력을 싣는다. product = xᵢ·wᵢ, 합이 from 에서 to 로 간다
 *   compare  silent 아님 — 마지막 걸음
 *            payload { sum: number; theta: number; margin: number; above: boolean;
 *                      from: number; to: number }
 *            합과 문턱을 한 번 견준다. margin = sum − θ, 출력이 from 에서 to 로 (넘으면 1, 같거나 낮으면 0)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WeightedInput = {
  /** 입력 식별자 (`x1`) */
  id: string;
  /** 무게 식별자 (`w1`) */
  weightId: string;
  value: number;
  weight: number;
};

export type WeightedSumThresholdFacetData = {
  type: 'weighted-sum-threshold';
  inputs: WeightedInput[];
  theta: number;
  stepMs: number;
};

export type SumAxis = { lo: number; hi: number; ticks: { v: number; major: boolean }[] };

function fail(path: string, why: string): never {
  throw new Error(`weighted-sum-threshold: ${path} — ${why}`);
}

function finite(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(path, '유한한 수가 아니다');
  return raw;
}

function text(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || raw.length === 0) fail(path, '빈 문자열이거나 문자열이 아니다');
  return raw;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowWeightedSumThresholdData(raw: unknown): WeightedSumThresholdFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'weighted-sum-threshold') fail('initialData.type', 'weighted-sum-threshold 가 아니다');
  if (!Array.isArray(r.inputs) || r.inputs.length === 0) fail('initialData.inputs', '빈 배열이거나 배열이 아니다');
  const inputs = r.inputs.map((it: unknown, i: number): WeightedInput => {
    const path = `initialData.inputs[${i}]`;
    if (typeof it !== 'object' || it === null) fail(path, '객체가 아니다');
    const o = it as Record<string, unknown>;
    return {
      id: text(o.id, `${path}.id`),
      weightId: text(o.weightId, `${path}.weightId`),
      value: finite(o.value, `${path}.value`),
      weight: finite(o.weight, `${path}.weight`),
    };
  });
  const stepMs = finite(r.stepMs, 'initialData.stepMs');
  if (stepMs <= 0) fail('initialData.stepMs', '0 보다 커야 한다');
  return { type: 'weighted-sum-threshold', inputs, theta: finite(r.theta, 'initialData.theta'), stepMs };
}

/** 합 눈금 — 0 · 도중의 합 전부 · 문턱을 담고 0.05 여유를 둔 뒤 0.1 칸에 맞춘다. */
function sumAxis(partials: number[], theta: number): SumAxis {
  const all = [0, ...partials, theta];
  const loTenth = Math.floor((Math.min(...all) - 0.05) * 10);
  const hiTenth = Math.ceil((Math.max(...all) + 0.05) * 10);
  const ticks: { v: number; major: boolean }[] = [];
  for (let k = loTenth; k <= hiTenth; k += 1) {
    ticks.push({ v: k / 10, major: k % 5 === 0 });
  }
  return { lo: loTenth / 10, hi: hiTenth / 10, ticks };
}

/** 화면 글자 — 소수 둘째 자리, 음수는 `−`, `-0.00` 은 없다. 장면 · 무대가 가져간다. */
export function formatValue(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  const zero = (0).toFixed(digits);
  if (s === `-${zero}`) return zero;
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

export async function weightedSumThreshold(
  rawCtx: FacetContext<WeightedSumThresholdFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<WeightedSumThresholdFacetData>;
  const data = narrowWeightedSumThresholdData(ctx.data);
  const { stepMs, inputs, theta } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 도중의 합을 먼저 셈해 눈금 범위를 정한다 (싣는 차례와 같은 차례)
  const partials: number[] = [];
  let acc = 0;
  for (const input of inputs) {
    if (ctx.cancelled) return;
    acc += input.value * input.weight;
    partials.push(acc);
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { sum: 0, output: 0, axis: sumAxis(partials, theta) },
  });

  let sum = 0;
  for (let index = 0; index < inputs.length; index += 1) {
    // 걸음 0 도 읽을 것이 있는 화면이라 첫 싣기 앞에도 머문다
    if (!(await pause())) return;
    const input = inputs[index];
    if (input === undefined) fail(`inputs[${index}]`, '없다');
    const product = input.value * input.weight;
    const from = sum;
    const to = sum + product;
    await ctx.emit({ type: 'load', payload: { index, product, from, to } });
    sum = to;
  }

  if (!(await pause())) return;
  const above = sum > theta;
  await ctx.emit({
    type: 'compare',
    payload: { sum, theta, margin: sum - theta, above, from: 0, to: above ? 1 : 0 },
  });
}
