/**
 * stop-before-turn — 조기 종료. 검증 손실이 가장 낮던 에폭을 기억하고, 그보다 나아지지 않은
 * 에폭을 세다가 참을성만큼 차면 멈추고 그 에폭의 무게로 돌아간다.
 *
 * 모형 y = w1·x1 + w2·x2. 한 에폭 = 훈련 자료 전체로 기울기를 셈해 갱신 한 번
 * (w ← w − η·∇, ∇ = 평균 (ŷ − y)·x). 손실 = 평균 ½(ŷ − y)². 에폭 e 의 검증 손실은
 * 에폭 e 의 갱신 뒤 무게로 셈한다. 나아짐 = 가장 좋던 값보다 엄격히 작다.
 *
 * 이벤트
 *   init   (silent) { lo: number; hi: number; lastEpoch: number;
 *                     epoch: 0; w1: number; w2: number; val: number }
 *          lo · hi = 재생할 에폭들의 검증 손실 최솟값 · 최댓값 (세로 축척). lastEpoch = 멈춘 에폭.
 *          에폭 0(갱신 전) 을 걸음 0 으로 갈아 끼운다.
 *   epoch  { epoch: number; w1: number; w2: number; val: number; improved: boolean;
 *            bestEpoch: number; bestVal: number; wait: number; stopped: boolean }
 *          에폭 하나의 갱신 뒤. bestEpoch · bestVal · wait 는 이 에폭을 판정한 뒤의 값.
 *          stopped = 기다림이 참을성에 닿아 학습이 여기서 멈춘다.
 *   revert { from: number; to: number; w1: number; w2: number; val: number }
 *          쓰는 무게를 멈춘 에폭(from)의 것에서 가장 좋던 에폭(to)의 것으로 되돌린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** (x1, x2, y) */
export type Sample = readonly [number, number, number];

export type StopBeforeTurnFacetData = {
  type: 'stop-before-turn';
  stepMs: number;
  train: Sample[];
  val: Sample[];
  start: [number, number];
  eta: number;
  patience: number;
  maxEpochs: number;
  /** 무게의 식별자 (자료 — 번역하지 않는다). */
  names: [string, string];
};

function fail(path: string, why: string): never {
  throw new Error(`stop-before-turn: ${path} — ${why}`);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function positiveInt(v: unknown, path: string): number {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n < 1) fail(path, '1 이상의 정수가 아니다');
  return n;
}

function samples(v: unknown, path: string): Sample[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, '비지 않은 배열이 아니다');
  return v.map((row: unknown, i) => {
    if (!Array.isArray(row) || row.length !== 3) fail(`${path}[${i}]`, '(x1, x2, y) 세 수가 아니다');
    return [
      finite(row[0], `${path}[${i}][0]`),
      finite(row[1], `${path}[${i}][1]`),
      finite(row[2], `${path}[${i}][2]`),
    ] as const;
  });
}

/** 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowStopBeforeTurnData(raw: unknown): StopBeforeTurnFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'stop-before-turn') fail('initialData.type', `'stop-before-turn' 이 아니다`);
  const start = d.start;
  if (!Array.isArray(start) || start.length !== 2) fail('initialData.start', '무게 두 개가 아니다');
  const names = d.names;
  if (
    !Array.isArray(names) ||
    names.length !== 2 ||
    typeof names[0] !== 'string' ||
    typeof names[1] !== 'string' ||
    names[0] === '' ||
    names[1] === ''
  ) {
    fail('initialData.names', '비지 않은 이름 두 개가 아니다');
  }
  const eta = finite(d.eta, 'initialData.eta');
  if (eta <= 0) fail('initialData.eta', '양수가 아니다');
  const stepMs = finite(d.stepMs, 'initialData.stepMs');
  if (stepMs < 0) fail('initialData.stepMs', '음수다');
  return {
    type: 'stop-before-turn',
    stepMs,
    train: samples(d.train, 'initialData.train'),
    val: samples(d.val, 'initialData.val'),
    start: [finite(start[0], 'initialData.start[0]'), finite(start[1], 'initialData.start[1]')],
    eta,
    patience: positiveInt(d.patience, 'initialData.patience'),
    maxEpochs: positiveInt(d.maxEpochs, 'initialData.maxEpochs'),
    names: [names[0] as string, names[1] as string],
  };
}

/** 평균 ½(ŷ − y)² — 훈련 · 검증 같은 식, 각자 제 점 수로 나눈다. */
export function meanHalfSquared(rows: readonly Sample[], w1: number, w2: number): number {
  let s = 0;
  for (const [x1, x2, y] of rows) {
    const r = w1 * x1 + w2 * x2 - y;
    s += 0.5 * r * r;
  }
  return s / rows.length;
}

export type EpochRecord = {
  epoch: number;
  w1: number;
  w2: number;
  val: number;
  improved: boolean;
  bestEpoch: number;
  bestVal: number;
  wait: number;
  stopped: boolean;
};

/**
 * 조기 종료로 훈련한다. 에폭 0(갱신 전) 부터 멈춘 에폭까지의 기록을 돌려준다.
 * 에폭 상한에 닿도록 멈추지 않으면 던진다 — 이 조각의 말은 참을성이 멈추는 것이다.
 */
export function trainWithEarlyStopping(d: StopBeforeTurnFacetData): EpochRecord[] {
  let [w1, w2] = d.start;
  const v0 = meanHalfSquared(d.val, w1, w2);
  const out: EpochRecord[] = [
    { epoch: 0, w1, w2, val: v0, improved: false, bestEpoch: 0, bestVal: v0, wait: 0, stopped: false },
  ];
  let bestEpoch = 0;
  let bestVal = v0;
  let wait = 0;
  const n = d.train.length;
  for (let e = 1; e <= d.maxEpochs; e += 1) {
    let g1 = 0;
    let g2 = 0;
    for (const [x1, x2, y] of d.train) {
      const r = w1 * x1 + w2 * x2 - y;
      g1 += (r * x1) / n;
      g2 += (r * x2) / n;
    }
    w1 -= d.eta * g1;
    w2 -= d.eta * g2;
    const val = meanHalfSquared(d.val, w1, w2);
    const improved = val < bestVal;
    if (improved) {
      bestEpoch = e;
      bestVal = val;
      wait = 0;
    } else {
      wait += 1;
    }
    const stopped = wait >= d.patience;
    out.push({ epoch: e, w1, w2, val, improved, bestEpoch, bestVal, wait, stopped });
    if (stopped) return out;
  }
  throw new Error(
    `stop-before-turn: 에폭 상한 ${d.maxEpochs} 까지 기다림이 참을성 ${d.patience} 에 닿지 않았다`,
  );
}

export async function stopBeforeTurn(ctx: FacetContext<StopBeforeTurnFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<StopBeforeTurnFacetData>;
  const d = narrowStopBeforeTurnData(ctx.data);
  const stepMs = d.stepMs;
  const records = trainWithEarlyStopping(d);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const first = records[0];
  const last = records[records.length - 1];
  let lo = first.val;
  let hi = first.val;
  for (const r of records) {
    if (r.val < lo) lo = r.val;
    if (r.val > hi) hi = r.val;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { lo, hi, lastEpoch: last.epoch, epoch: 0, w1: first.w1, w2: first.w2, val: first.val },
  });

  for (const r of records.slice(1)) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'epoch',
      payload: {
        epoch: r.epoch,
        w1: r.w1,
        w2: r.w2,
        val: r.val,
        improved: r.improved,
        bestEpoch: r.bestEpoch,
        bestVal: r.bestVal,
        wait: r.wait,
        stopped: r.stopped,
      },
    });
  }

  if (!(await pause())) return;
  const best = records[last.bestEpoch];
  await ctx.emit({
    type: 'revert',
    payload: { from: last.epoch, to: best.epoch, w1: best.w1, w2: best.w2, val: best.val },
  });
}
