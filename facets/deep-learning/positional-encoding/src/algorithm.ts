/**
 * positional-encoding — 사인 · 코사인 위치 표시에서 주파수를 늘리면 가장 닮은 간격이 이웃 쪽으로 옮겨 간다.
 *
 * 모형 (사양 · 공통 안내문):
 *   PE(p, 2i) = sin(p · ω_i) · PE(p, 2i+1) = cos(p · ω_i), ω_i = 1 / base^(2i/d), i = 0..d/2 − 1, 자리 p 는 0 부터, 라디안.
 *   간격 Δ 의 거리 D(Δ) = ‖PE(0) − PE(Δ)‖ (유클리드), Δ = 1..positions − 1.
 *   거리는 간격에만 달리므로 짝이 아니라 간격으로 센다 (같은 간격의 짝들은 수학적 동률이라 짝으로 고르면 잡음이 고른다).
 *   가장 닮은 간격 Δ* = argmin D(Δ). 헷갈리는 간격 = Δ ≥ 2 가운데 D(Δ) < D(1).
 *   축 끝 axisMax = 이 판의 max D(Δ).
 *   셈은 끝까지 배정도 — 표시값을 다음 셈에 넣지 않는다.
 *
 * 동률 규칙: Δ* 의 첫째와 둘째 거리 차, D(Δ) 와 D(1) 의 차가 TIE_EPS(1e-9) 안이면 던진다 (정할 규칙이 없다).
 *   이 데이터(자리 32 · base 10000 · d 2 · 4 · 8 · 16)에서는 걸리지 않는다 — 가장 작은 여유가 0.0177 · 0.0195.
 *
 * 걸음 (판 하나 — 다섯 걸음, 걸음 사이는 ctx.sleep(stepMs)):
 *   0 'board'     { dModel, positions, pairs }                         새 판 — 빈 표 · 빈 간격 축, 앞 판의 결론을 걷는다
 *   1 'encoding'  { dModel, omegas: number[pairs], rows: number[positions][dModel] }  줄무늬 표를 칠한다
 *   2 'distances' { distances: number[positions − 1] (Δ = 1..), axisMax }             간격 막대가 선다
 *   3 'neighbour' { neighbour: D(1), confusable: number[] (간격, 오름차순) }            이웃 거리 선과 헷갈리는 간격 표지
 *   4 'nearest'   { gap: Δ*, distance: D(Δ*), rowZero: PE(0), rowGap: PE(Δ*) }        가장 닮은 간격 표지와 짚는 두 줄
 *   모두 silent 가 아니다. phase 이벤트는 없다 — IR 을 두지 않으므로 phase 집합은 IR 과 같게 빈 집합 (C3).
 *
 * 계기 (C5):
 *   nearest-gap      가장 닮은 간격 Δ*          판 머리에 0 으로, 걸음 4 에서 값으로
 *   confusable-gaps  이웃보다 가까운 먼 간격의 수 판 머리에 0 으로, 걸음 3 에서 값으로
 *   누적 채널이라 지금 보이는 값을 들고 차이만 보낸다. 첫 판 머리에는 차이가 0 이어도 보낸다.
 *
 * 손잡이: action 'dModel' — payload.value 가 사다리 dModelLadder 의 값. 한 판을 끝까지 재생하고 입력을 기다린다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PositionalEncodingData = {
  type: 'positional-encoding';
  stepMs: number;
  positions: number;
  base: number;
  dModelLadder: number[];
  dModel: number;
};

/** 한 판의 셈 — 알고리즘 · 검사가 함께 쓴다. */
export type PositionalEncodingBoard = {
  dModel: number;
  omegas: number[];
  rows: number[][];
  distances: number[];
  axisMax: number;
  neighbour: number;
  confusable: number[];
  gap: number;
  distance: number;
};

const TIE_EPS = 1e-9;

/** ctx.data 좁히개 — 모양이 어긋나면 던진다. */
export function narrowPositionalEncoding(raw: unknown): PositionalEncodingData {
  if (typeof raw !== 'object' || raw === null) throw new Error('positional-encoding: 자료가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'positional-encoding') throw new Error(`positional-encoding: type 이 '${String(o.type)}'`);
  const { stepMs, positions, base, dModelLadder, dModel } = o;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('positional-encoding: stepMs 는 양수');
  if (typeof positions !== 'number' || !Number.isInteger(positions) || positions < 3) {
    throw new Error('positional-encoding: positions 는 3 이상의 정수');
  }
  if (typeof base !== 'number' || !(base > 1)) throw new Error('positional-encoding: base 는 1 보다 큰 수');
  if (!Array.isArray(dModelLadder) || dModelLadder.length === 0) throw new Error('positional-encoding: dModelLadder 가 비었다');
  const ladder: number[] = [];
  for (const v of dModelLadder) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 2 || v % 2 !== 0) {
      throw new Error(`positional-encoding: 사다리 값 ${String(v)} 은 2 이상의 짝수여야 한다`);
    }
    if (ladder.length > 0 && v <= ladder[ladder.length - 1]!) throw new Error('positional-encoding: 사다리는 오름차순');
    ladder.push(v);
  }
  if (typeof dModel !== 'number' || !ladder.includes(dModel)) throw new Error(`positional-encoding: dModel ${String(dModel)} 이 사다리 밖`);
  return { type: 'positional-encoding', stepMs, positions, base, dModelLadder: ladder, dModel };
}

/** 한 판을 셈한다 — 순수 함수. */
export function computePositionalEncoding(
  data: Pick<PositionalEncodingData, 'positions' | 'base'>,
  dModel: number,
): PositionalEncodingBoard {
  const pairs = dModel / 2;
  const omegas: number[] = [];
  for (let i = 0; i < pairs; i += 1) omegas.push(1 / Math.pow(data.base, (2 * i) / dModel));

  const rows: number[][] = [];
  for (let p = 0; p < data.positions; p += 1) {
    const row: number[] = [];
    for (const w of omegas) {
      row.push(Math.sin(p * w));
      row.push(Math.cos(p * w));
    }
    rows.push(row);
  }

  const zero = rows[0]!;
  const distances: number[] = [];
  for (let gap = 1; gap < data.positions; gap += 1) {
    const row = rows[gap]!;
    let sum = 0;
    for (let c = 0; c < dModel; c += 1) {
      const diff = zero[c]! - row[c]!;
      sum += diff * diff;
    }
    distances.push(Math.sqrt(sum));
  }

  // 가장 닮은 간격 — 첫째와 둘째가 TIE_EPS 안이면 정할 규칙이 없으니 던진다
  let best = 0;
  for (let k = 1; k < distances.length; k += 1) if (distances[k]! < distances[best]!) best = k;
  for (let k = 0; k < distances.length; k += 1) {
    if (k !== best && Math.abs(distances[k]! - distances[best]!) < TIE_EPS) {
      throw new Error(`positional-encoding: d ${dModel} 에서 가장 닮은 간격이 동률 (${best + 1} · ${k + 1})`);
    }
  }

  const neighbour = distances[0]!;
  const confusable: number[] = [];
  for (let k = 1; k < distances.length; k += 1) {
    const dk = distances[k]!;
    if (Math.abs(dk - neighbour) < TIE_EPS) throw new Error(`positional-encoding: d ${dModel} 에서 간격 ${k + 1} 의 거리가 이웃과 동률`);
    if (dk < neighbour) confusable.push(k + 1);
  }

  return {
    dModel,
    omegas,
    rows,
    distances,
    axisMax: Math.max(...distances),
    neighbour,
    confusable,
    gap: best + 1,
    distance: distances[best]!,
  };
}

export async function positionalEncodingAlgorithm(ctx: FacetContext<PositionalEncodingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PositionalEncodingData>;
  const data = narrowPositionalEncoding(ctx.data);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown: Record<string, number | undefined> = {};
  const setMetric = (name: 'nearest-gap' | 'confusable-gaps', value: number): void => {
    const before = shown[name];
    if (before === undefined) {
      ctx.metric(name, value);
    } else if (value !== before) {
      ctx.metric(name, value - before);
    }
    shown[name] = value;
  };

  /** 판 하나 — 끝까지 재생하면 true, 취소되면 false. */
  const playBoard = async (dModel: number): Promise<boolean> => {
    const board = computePositionalEncoding(data, dModel);

    // 걸음 0 — 새 판, 계기는 0 으로
    setMetric('nearest-gap', 0);
    setMetric('confusable-gaps', 0);
    await ctx.emit({ type: 'board', payload: { dModel, positions: data.positions, pairs: dModel / 2 } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 1 — 줄무늬 표
    await ctx.emit({ type: 'encoding', payload: { dModel, omegas: board.omegas, rows: board.rows } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 2 — 간격별 거리
    await ctx.emit({ type: 'distances', payload: { distances: board.distances, axisMax: board.axisMax } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 3 — 이웃 거리와 헷갈리는 간격
    setMetric('confusable-gaps', board.confusable.length);
    await ctx.emit({ type: 'neighbour', payload: { neighbour: board.neighbour, confusable: board.confusable } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 4 — 가장 닮은 간격
    setMetric('nearest-gap', board.gap);
    await ctx.emit({
      type: 'nearest',
      payload: { gap: board.gap, distance: board.distance, rowZero: board.rows[0], rowGap: board.rows[board.gap] },
    });
    return true;
  };

  /** 손잡이 입력을 기다린다 — 우리 것이 아닌 입력은 흘린다. */
  const waitKnob = async (): Promise<number | null> => {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'dModel') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) throw new Error('positional-encoding: dModel 입력에 payload 가 없다');
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number' || !data.dModelLadder.includes(value)) {
        throw new Error(`positional-encoding: dModel 값 ${String(value)} 이 사다리 밖`);
      }
      return value;
    }
  };

  try {
    let dModel = data.dModel;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playBoard(dModel))) return;
      const next = await waitKnob();
      if (next === null) return;
      dModel = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
