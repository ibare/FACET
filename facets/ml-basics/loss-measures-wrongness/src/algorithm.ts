/**
 * loss-measures-wrongness — 보기마다 정답에서 벌어진 폭이 값으로 바뀌고, 값들이 한 합에 쌓여 평균 하나로 모인다.
 *
 * 보기 i 의 값 Lᵢ = −[y·ln p + (1 − y)·ln(1 − p)] (자연로그). 정답에 준 확률 = y 가 1 이면 p, 0 이면 1 − p.
 * 벌어진 폭 = 1 − 정답에 준 확률. 손실 = 값들의 평균 (합 ÷ 보기 수).
 *
 * 이벤트
 *   init     (silent) — 바탕. 걸음 0 을 갈아 끼운다.
 *     payload: {
 *       curve: [gap, value][]   폭에 따른 값의 곡선 점 (0 부터 값이 valueTop 에 닿는 폭까지)
 *       valueTop: number        곡선 칸의 세로 끝 (가장 큰 값을 올림한 정수)
 *       stackTop: number        합 기둥의 세로 끝 (값 전부의 합)
 *     }
 *   measure  — 보기 하나의 값을 셈해 합에 싣는다. 데이터 차례대로 한 번씩.
 *     payload: {
 *       index: number   보기 차례 (0 부터)
 *       id: string      보기 식별자
 *       given: number   정답에 준 확률
 *       gap: number     벌어진 폭
 *       value: number   이 보기의 값 Lᵢ
 *       ratio: number   값 ÷ 폭
 *       sum: number     여기까지의 합
 *     }
 *   average  — 합을 보기 수로 나눈다. 마지막 걸음.
 *     payload: { sum: number; count: number; mean: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LossExample = { id: string; y: 0 | 1; p: number };

export type LossMeasuresWrongnessFacetData = {
  type: 'loss-measures-wrongness';
  stepMs: number;
  examples: LossExample[];
};

/** 곡선 한 벌에 찍는 점 수. */
const CURVE_POINTS = 60;

/** 알고리즘 · 장면 · 무대가 함께 쓰는 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function narrowLossData(raw: unknown): LossMeasuresWrongnessFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('loss-measures-wrongness: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'loss-measures-wrongness') {
    throw new Error(`loss-measures-wrongness: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) {
    throw new Error('loss-measures-wrongness: initialData.stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(r.examples) || r.examples.length === 0) {
    throw new Error('loss-measures-wrongness: initialData.examples 가 비었다');
  }
  const examples: LossExample[] = r.examples.map((e: unknown, i: number) => {
    if (typeof e !== 'object' || e === null) {
      throw new Error(`loss-measures-wrongness: initialData.examples[${i}] 가 객체가 아니다`);
    }
    const o = e as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') {
      throw new Error(`loss-measures-wrongness: initialData.examples[${i}].id 가 없다`);
    }
    if (o.y !== 0 && o.y !== 1) {
      throw new Error(`loss-measures-wrongness: initialData.examples[${i}].y 가 0 도 1 도 아니다`);
    }
    if (typeof o.p !== 'number' || !(o.p > 0 && o.p < 1)) {
      throw new Error(`loss-measures-wrongness: initialData.examples[${i}].p 가 0 과 1 사이가 아니다`);
    }
    return { id: o.id, y: o.y, p: o.p };
  });
  return { type: 'loss-measures-wrongness', stepMs: r.stepMs, examples };
}

/** 정답에 준 확률. */
function givenProb(e: LossExample): number {
  return e.y === 1 ? e.p : 1 - e.p;
}

/** 교차 엔트로피 한 보기의 값. */
function crossEntropy(e: LossExample): number {
  return -(e.y * Math.log(e.p) + (1 - e.y) * Math.log(1 - e.p));
}

export async function lossMeasuresWrongness(
  context: FacetContext<LossMeasuresWrongnessFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LossMeasuresWrongnessFacetData>;
  const data = narrowLossData(ctx.data);
  const { stepMs, examples } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const values = examples.map(crossEntropy);
  const valueTop = Math.ceil(Math.max(...values));
  const stackTop = values.reduce((a, b) => a + b, 0);
  // 값 = −ln(1 − 폭) 이 valueTop 에 닿는 폭까지 곡선을 찍는다
  const gapEnd = 1 - Math.exp(-valueTop);
  const curve: [number, number][] = [];
  for (let k = 0; k <= CURVE_POINTS; k += 1) {
    const g = (gapEnd * k) / CURVE_POINTS;
    curve.push([g, -Math.log(1 - g)]);
  }

  await ctx.emit({ type: 'init', silent: true, payload: { curve, valueTop, stackTop } });

  let sum = 0;
  for (const [i, e] of examples.entries()) {
    // 걸음 0 은 보기 다섯이 이미 읽을 화면이라 첫 셈 앞에도 한 번 머문다
    if (!(await pause())) return;
    const given = givenProb(e);
    const gap = 1 - given;
    const value = crossEntropy(e);
    sum += value;
    await ctx.emit({
      type: 'measure',
      payload: { index: i, id: e.id, given, gap, value, ratio: value / gap, sum },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'average',
    payload: { sum, count: examples.length, mean: sum / examples.length },
  });
}
