/**
 * weight-sharing — 무게 한 벌이 입력의 자리마다 옮겨 가 다시 쓰인다.
 *
 * 1차원 교차 상관 (편향 없음 · 보폭 1 · 패딩 없음). 출력 (p) = Σᵢ 입력[p + i] × 무게[i].
 * 걸음 하나 = 자리 하나 (왼쪽부터).
 *
 * 이벤트
 *   init   (silent) { outLen: number; weightCount: number }
 *            출력 길이 = n − k + 1 과 둔 무게의 수. 걸음 0 의 바탕을 갈아 끼운다.
 *   place  { pos: number; value: number; used: number; products: number;
 *            weightCount: number; separate: number; twin: number | null }
 *            무게 한 벌이 자리 pos 에 앉아 출력 value 를 낸다.
 *            used = 쓰인 자리 수, products = 쓰인 곱 수 (= k × used),
 *            weightCount = 둔 무게 수 (늘 k), separate = 자리마다 따로면 필요한 무게 수 (= k × used),
 *            twin = 창 길이만큼 자른 입력이 이 자리와 같은 가장 앞 자리 (없으면 null).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WeightSharingFacetData = {
  type: 'weight-sharing';
  input: number[];
  weights: number[];
  stepMs: number;
};

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** 자료를 좁힌다. 모르는 모양은 던진다 (C6). */
export function readWeightSharingData(raw: unknown): WeightSharingFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('weight-sharing: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'weight-sharing') throw new Error(`weight-sharing: type 이 다르다 (${String(r.type)})`);
  if (!isIntArray(r.input)) throw new Error('weight-sharing: input 은 정수 배열이어야 한다');
  if (!isIntArray(r.weights)) throw new Error('weight-sharing: weights 는 정수 배열이어야 한다');
  if (r.weights.length === 0) throw new Error('weight-sharing: 무게가 비었다');
  if (r.input.length < r.weights.length) {
    throw new Error(`weight-sharing: 입력(${r.input.length})이 창(${r.weights.length})보다 짧다`);
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('weight-sharing: stepMs 가 없다');
  return { type: 'weight-sharing', input: [...r.input], weights: [...r.weights], stepMs: r.stepMs };
}

/** 출력 길이 = ⌊(n + 2p − k) / s⌋ + 1, p = 0 · s = 1. */
export function outputLength(n: number, k: number): number {
  if (n < k) throw new Error(`weight-sharing: 입력(${n})이 창(${k})보다 짧다`);
  return n - k + 1;
}

/** 자리 pos 의 창이 덮는 입력 조각. 밖이면 던진다. */
export function windowAt(input: readonly number[], k: number, pos: number): number[] {
  if (!Number.isInteger(pos) || pos < 0 || pos + k > input.length) {
    throw new Error(`weight-sharing: 자리 ${pos} 의 창이 입력 밖이다`);
  }
  return input.slice(pos, pos + k);
}

function crossCorrelate(slice: readonly number[], weights: readonly number[]): number {
  let sum = 0;
  for (const [i, w] of weights.entries()) {
    const x = slice[i];
    if (x === undefined) throw new Error(`weight-sharing: 창 조각에 ${i} 번째 칸이 없다`);
    sum += x * w;
  }
  return sum;
}

function sameSlice(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function weightSharing(baseCtx: FacetContext<WeightSharingFacetData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<WeightSharingFacetData>;
  const { input, weights, stepMs } = readWeightSharingData(ctx.data);
  const k = weights.length;
  const outLen = outputLength(input.length, k);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', silent: true, payload: { outLen, weightCount: k } });

  const outputs: number[] = [];
  for (let pos = 0; pos < outLen; pos += 1) {
    // 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 걸음 앞에도 머문다.
    if (!(await pause())) return;
    const slice = windowAt(input, k, pos);
    const value = crossCorrelate(slice, weights);
    let twin: number | null = null;
    for (let q = 0; q < pos; q += 1) {
      if (ctx.cancelled) return;
      if (sameSlice(windowAt(input, k, q), slice)) {
        if (outputs[q] !== value) {
          throw new Error(`weight-sharing: 같은 입력인데 출력이 다르다 (자리 ${q} · ${pos})`);
        }
        twin = q;
        break;
      }
    }
    outputs.push(value);
    const used = pos + 1;
    await ctx.emit({
      type: 'place',
      payload: { pos, value, used, products: k * used, weightCount: k, separate: k * used, twin },
    });
  }
}
