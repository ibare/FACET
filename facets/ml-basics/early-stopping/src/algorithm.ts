/**
 * early-stopping — 조기 종료와 참을성.
 *
 * 특징 여덟 · 치우침 없는 선형 모형 ŷ = Σⱼ wⱼ·xⱼ 을 훈련 열 점 위에서 묶음 하나 SGD 로 배운다.
 * 에폭마다 검증 스무 점의 손실(평균 ½(ŷ − y)²)을 재고, 가장 좋던 값보다 **엄격히 작으면** 가장 좋던
 * 에폭 · 무게를 바꾸고 기다림을 0 으로, 아니면 기다림을 1 늘린다. 기다림이 참을성에 닿는 그 에폭에서
 * 멈추고, 쓰는 무게를 가장 좋던 에폭의 무게로 되돌린다.
 *
 * 셈의 차례 (IR `earlyStop` · `sgdEpoch` · `valLoss` 와 같다):
 *   - ŷ 는 j = 0 … 7 차례로 p = p + w[j]·x[j]
 *   - 손실 s = Σᵢ e·e (e = ŷ − y), 값 = s / (2·m)
 *   - SGD 한 점: e = ŷ − y (갱신 앞 w) ; j 차례로 w[j] ← w[j] − η·e·x[j] (η·e 를 먼저 곱한다)
 *   - 에폭 e 의 검증 손실은 그 에폭의 갱신 열 번 뒤 무게로. 에폭 0 = 시작 무게 0
 *
 * 동률 규칙: 나아짐은 `v < best` (엄격). 같으면 나아짐이 아니다. 이 데이터에서 |v − best| 의 최소는
 * 0.0027 이라 동률은 걸리지 않는다 (test 가 여유를 잰다).
 * 차례(`orders`)가 다했는데 멈추지 않으면 던진다 (IR 은 marks[1] = −1 을 남긴다).
 *
 * 이벤트 (payload 는 모두 셈한 값 — 무대는 다시 셈하지 않는다):
 *   - `es-run`     silent · 판 머리. { patience: number; epochCount: number; featureCount: number;
 *                  yMin: number; yMax: number; wAbs: number }
 *                  yMin · yMax = 사다리의 가장 큰 참을성 판의 에폭 1 … 멈춘 에폭 검증 손실의 최소 · 최대
 *                  (에폭 0 은 넣지 않는다 — 축 위로 벗어난 자리). wAbs = 그 판에서 나온 무게 |w| 의 최대
 *   - `es-epoch`   걸음. { epoch; val; bestEpoch; bestVal; wait; patience;
 *                  verdict: 'start' | 'improve' | 'wait' | 'stop'; weights: number[] }
 *                  weights = 그 에폭 끝의 무게(쓰는 무게)
 *   - `es-restore` 걸음. { bestEpoch; bestVal; stopEpoch; weights: number[] } — weights = 되돌린 무게
 *   - `phase`      silent. { phase } — 걸음 이벤트 바로 앞
 *
 * phase 어휘 (irs.ts 와 같다): `start` · `improve` · `wait` · `stop` · `restore`
 *
 * 계기: `best-epoch` (가장 좋던 에폭 — 에폭마다 지금 값) · `stop-epoch` (멈추기 전 0, 멈춘 걸음에서 멈춘 에폭).
 * 판 머리에서 둘 다 0 으로 되돌린다 (지금 값을 들고 차이만 보낸다).
 *
 * 손잡이: `patience` — payload.value 가 사다리(`patienceLadder`) 안의 수일 때만 받는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EarlyStoppingPoint = { x: number[]; y: number };

export type EarlyStoppingData = {
  type: 'early-stopping';
  stepMs: number;
  eta: number;
  patience: number;
  patienceLadder: number[];
  train: EarlyStoppingPoint[];
  val: EarlyStoppingPoint[];
  orders: number[][];
};

export type EpochVerdict = 'start' | 'improve' | 'wait' | 'stop';

export type EpochRecord = {
  epoch: number;
  val: number;
  bestEpoch: number;
  bestVal: number;
  wait: number;
  verdict: EpochVerdict;
  weights: number[];
};

export type EarlyStopRun = {
  records: EpochRecord[];
  stopEpoch: number;
  bestEpoch: number;
  bestVal: number;
  bestWeights: number[];
};

/** 평균 ½(ŷ − y)² — s = Σ e·e, 값 = s / (2·m). */
export function valLoss(w: readonly number[], pts: readonly EarlyStoppingPoint[]): number {
  const d = w.length;
  let s = 0;
  for (const pt of pts) {
    let p = 0;
    for (let j = 0; j < d; j += 1) p = p + w[j]! * pt.x[j]!;
    const e = p - pt.y;
    s = s + e * e;
  }
  const denom = 2 * pts.length;
  return s / denom;
}

/** 묶음 하나 SGD 한 에폭 — 차례대로 한 점씩. w 를 제자리에서 바꾼다. */
export function sgdEpoch(
  w: number[],
  train: readonly EarlyStoppingPoint[],
  order: readonly number[],
  eta: number,
): void {
  const d = w.length;
  for (const i of order) {
    const pt = train[i];
    if (pt === undefined) throw new Error(`early-stopping: 차례의 자리 ${i} 에 훈련 점이 없다`);
    let p = 0;
    for (let j = 0; j < d; j += 1) p = p + w[j]! * pt.x[j]!;
    const e = p - pt.y;
    for (let j = 0; j < d; j += 1) w[j] = w[j]! - eta * e * pt.x[j]!;
  }
}

/** 자료 모양을 확인한다 — 셈할 수 없는 모양은 던진다. 특징 수를 돌려준다. */
export function checkData(data: EarlyStoppingData): number {
  if (data.type !== 'early-stopping') throw new Error(`early-stopping: 모르는 자료 ${String(data.type)}`);
  const first = data.train[0];
  if (first === undefined) throw new Error('early-stopping: 훈련 점이 없다');
  const d = first.x.length;
  if (d === 0) throw new Error('early-stopping: 특징이 없다');
  for (const pt of [...data.train, ...data.val]) {
    if (pt.x.length !== d) throw new Error('early-stopping: 특징 수가 점마다 다르다');
  }
  if (data.val.length === 0) throw new Error('early-stopping: 검증 점이 없다');
  const n = data.train.length;
  for (const order of data.orders) {
    const seen = new Set(order);
    if (order.length !== n || seen.size !== n || order.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) {
      throw new Error('early-stopping: 차례가 훈련 자리의 순열이 아니다');
    }
  }
  if (!data.patienceLadder.includes(data.patience)) {
    throw new Error(`early-stopping: 참을성 ${data.patience} 이 사다리에 없다`);
  }
  return d;
}

/** 한 판을 끝까지 셈한다. 기록 = 에폭 0 … 멈춘 에폭. 차례 안에 멈추지 않으면 던진다. */
export function runEarlyStop(data: EarlyStoppingData, patience: number): EarlyStopRun {
  const d = checkData(data);
  if (!Number.isInteger(patience) || patience < 1) throw new Error(`early-stopping: 참을성 ${patience}`);
  const w: number[] = new Array<number>(d).fill(0);
  let best = valLoss(w, data.val);
  let bestEpoch = 0;
  let bestWeights = [...w];
  let wait = 0;
  const records: EpochRecord[] = [
    { epoch: 0, val: best, bestEpoch: 0, bestVal: best, wait: 0, verdict: 'start', weights: [...w] },
  ];
  for (let e = 1; e <= data.orders.length; e += 1) {
    sgdEpoch(w, data.train, data.orders[e - 1]!, data.eta);
    const v = valLoss(w, data.val);
    let verdict: EpochVerdict;
    if (v < best) {
      best = v;
      bestEpoch = e;
      bestWeights = [...w];
      wait = 0;
      verdict = 'improve';
    } else {
      wait += 1;
      verdict = wait >= patience ? 'stop' : 'wait';
    }
    records.push({ epoch: e, val: v, bestEpoch, bestVal: best, wait, verdict, weights: [...w] });
    if (verdict === 'stop') return { records, stopEpoch: e, bestEpoch, bestVal: best, bestWeights };
  }
  throw new Error(`early-stopping: 참을성 ${patience} 이 차례 ${data.orders.length} 에폭 안에 멈추지 않았다`);
}

/** 축 — 사다리의 가장 큰 참을성 판(가장 긴 판)으로 고정한다. 참을성마다 축이 바뀌지 않게. */
export function axisOf(data: EarlyStoppingData): { yMin: number; yMax: number; wAbs: number } {
  const longest = Math.max(...data.patienceLadder);
  const { records } = runEarlyStop(data, longest);
  const later = records.slice(1).map((r) => r.val);
  if (later.length === 0) throw new Error('early-stopping: 에폭 1 이 없다');
  let wAbs = 0;
  for (const r of records) for (const x of r.weights) wAbs = Math.max(wAbs, Math.abs(x));
  return { yMin: Math.min(...later), yMax: Math.max(...later), wAbs };
}

type PatienceInput = { type: string; payload?: unknown };

function readPatience(input: PatienceInput, ladder: readonly number[]): number | null {
  if (input.type !== 'patience') return null;
  const p = input.payload;
  if (typeof p !== 'object' || p === null || !('value' in p)) return null;
  const v = (p as { value: unknown }).value;
  if (typeof v !== 'number' || !ladder.includes(v)) return null;
  return v;
}

export async function earlyStoppingAlgorithm(ctx: FacetContext<EarlyStoppingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<EarlyStoppingData>;
  const data = ctx.data;
  const d = checkData(data);
  const axis = axisOf(data);
  const shown = { 'best-epoch': 0, 'stop-epoch': 0 };
  const setMetric = (name: 'best-epoch' | 'stop-epoch', value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let patience = data.patience;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = runEarlyStop(data, patience);
      setMetric('best-epoch', 0);
      setMetric('stop-epoch', 0);
      await ctx.emit({
        type: 'es-run',
        payload: {
          patience,
          epochCount: data.orders.length,
          featureCount: d,
          yMin: axis.yMin,
          yMax: axis.yMax,
          wAbs: axis.wAbs,
        },
        silent: true,
      });
      for (const r of run.records) {
        if (ctx.cancelled) return;
        switch (r.verdict) {
          case 'start':
            await phase('start');
            break;
          case 'improve':
            await phase('improve');
            break;
          case 'wait':
            await phase('wait');
            break;
          case 'stop':
            await phase('stop');
            break;
        }
        setMetric('best-epoch', r.bestEpoch);
        if (r.verdict === 'stop') setMetric('stop-epoch', r.epoch);
        await ctx.emit({
          type: 'es-epoch',
          payload: {
            epoch: r.epoch,
            val: r.val,
            bestEpoch: r.bestEpoch,
            bestVal: r.bestVal,
            wait: r.wait,
            patience,
            verdict: r.verdict,
            weights: [...r.weights],
          },
        });
        if (!(await rctx.sleep(data.stepMs))) return;
      }
      if (ctx.cancelled) return;
      await phase('restore');
      await ctx.emit({
        type: 'es-restore',
        payload: {
          bestEpoch: run.bestEpoch,
          bestVal: run.bestVal,
          stopEpoch: run.stopEpoch,
          weights: [...run.bestWeights],
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        next = readPatience(input, data.patienceLadder);
      }
      patience = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
