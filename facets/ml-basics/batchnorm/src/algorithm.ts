/**
 * batchnorm — 한 값이 누구와 한 묶음이냐에 따라 맞춘 자리가 흩어진다.
 *
 * 값 열여섯(`xs`) 가운데 지켜보는 값 하나(`xs[track]`)를, 고정한 섞은 차례 여덟 벌로 매번 다르게 묶는다.
 * 묶음 k 는 섞은 차례의 [k·B … k·B + B − 1] 자리다. 지켜보는 값이 든 묶음의 평균 μ 와 모집단 분산 σ² 로
 * `(x − μ) / √(σ² + ε)` 를 셈해(γ 1 · β 0) 그 값이 떨어진 자리를 모은다. 손잡이는 묶음 크기 B 하나.
 * 셈의 길은 `bnParts` 하나다 — IR 의 `bnValue` 와 같은 차례(자리 찾기 → 묶음 평균 → 모집단 분산 → 맞춤)로 셈한다.
 *
 * ── 이벤트 (payload 스키마 · silent 여부)
 *   init      silent  { xs: number[]; track: number; wholeSpot: number; wholeMean: number; stepMs: number;
 *                       shuffleCount: number }
 *             값 줄 · 지켜보는 값 · 전체로 맞춘 자리(차례 0‥15 · B 16 으로 부른 값)를 한 번 싣는다.
 *   board     걸음 0  { batch: number }  — 판 머리. 앞 판의 점 무더기 · 표지를 걷는다
 *   gather    걸음    { shuffle: number (1 부터); batch: number; peers: number[] (묶음 동료의 번호, 섞은 차례대로);
 *                       mu: number }  — 묶음 모음 (동료가 켜지고 μ 표지가 선다)
 *   scale     걸음    { shuffle: number; mu: number; sigma: number; spot: number; last: boolean; meanDiff: number | null }
 *             폭 맞춤 (σ 괄호 · 떨어진 자리). 여덟째 섞음에서만 last 가 참이고 meanDiff 가 실린다
 *   phase     silent  { phase: 'bn-gather' | 'bn-scale' }
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   bn-gather — 묶음 모음 걸음 앞 · bn-scale — 폭 맞춤 걸음 앞. 걸음 0 에는 phase 가 없다
 *
 * ── 계기
 *   drops          떨어진 점 수 (폭 맞춤 걸음마다 +1, 판 끝 8)
 *   batches-formed 지나간 섞음에서 만든 묶음 수 (섞음마다 16 / B, 판 끝 64 · 32 · 16 · 8)
 *   판 머리에 0 으로 (차이로) 되돌린다.
 *
 * ── 동률 · 경계
 *   섞은 차례는 0‥15 의 섞음이라 지켜보는 번호는 한 번만 나온다 (여러 번이면 IR 처럼 마지막 자리를 쓴다 —
 *   이 데이터에서는 걸리지 않는다). 표시 자리(떨어진 자리 · 평균 차 둘째 자리)에 반올림 경계는 없다 (sim 단언).
 *   μ · σ 는 …25 · …75 경계에 닿아 수로 찍지 않는다 — 표지로만.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BatchnormData = {
  type: 'batchnorm';
  stepMs: number;
  xs: number[];
  track: number;
  shuffles: number[][];
  batchLadder: number[];
  batch: number;
  eps: number;
};

export type BnParts = {
  /** 지켜보는 번호가 섞은 차례에서 선 자리 (0 부터) */
  pos: number;
  /** 그 자리가 든 묶음의 동료 번호 (섞은 차례대로) */
  peers: number[];
  mu: number;
  sigma: number;
  normed: number;
};

/**
 * 한 섞은 차례 · 묶음 크기에서 지켜보는 값을 맞춘다. IR `bnValue` 와 같은 길.
 * 지켜보는 번호가 차례에 없으면 던진다 (IR 은 −1000 표지).
 */
export function bnParts(xs: readonly number[], order: readonly number[], b: number, track: number, eps: number): BnParts {
  if (!Number.isInteger(b) || b <= 0) throw new Error(`batchnorm: 묶음 크기가 양의 정수가 아니다 — ${b}`);
  let pos = -1;
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] === track) pos = i;
  }
  if (pos < 0) throw new Error(`batchnorm: 지켜보는 번호 ${track} 가 섞은 차례에 없다`);
  const start = Math.floor(pos / b) * b;
  if (start + b > order.length) throw new Error(`batchnorm: 묶음이 차례 끝을 넘는다 — 자리 ${start} · 크기 ${b}`);
  const peers: number[] = [];
  const vals: number[] = [];
  let s = 0;
  for (let j = 0; j < b; j += 1) {
    const k = order[start + j];
    const v = k === undefined ? undefined : xs[k];
    if (k === undefined || v === undefined) throw new Error(`batchnorm: 차례 자리 ${start + j} 의 값이 없다`);
    peers.push(k);
    vals.push(v);
    s += v;
  }
  const mu = s / b;
  let q = 0;
  for (const v of vals) {
    const d = v - mu;
    q += d * d;
  }
  const variance = q / b;
  const x = xs[track];
  if (x === undefined) throw new Error(`batchnorm: 지켜보는 번호 ${track} 의 값이 없다`);
  const sigma = Math.sqrt(variance + eps);
  return { pos, peers, mu, sigma, normed: (x - mu) / sigma };
}

/** 차례 0‥n−1 · 묶음 크기 n 으로 부른 값 — 전체로 맞춘 자리. */
export function wholeParts(xs: readonly number[], track: number, eps: number): BnParts {
  const order = xs.map((_, i) => i);
  return bnParts(xs, order, xs.length, track, eps);
}

/** 여덟 자리와 전체로 맞춘 자리의 평균 차 (|자리 − 전체| 의 평균). */
export function meanDiffOf(spots: readonly number[], whole: number): number {
  if (spots.length === 0) throw new Error('batchnorm: 떨어진 자리가 없다');
  let sum = 0;
  for (const s of spots) sum += Math.abs(s - whole);
  return sum / spots.length;
}

/** 표시 — 떨어진 자리 · 전체로 맞춘 자리 · 평균 차는 둘째 자리 */
export function fmt2(x: number): string {
  return x.toFixed(2);
}

/** 원래 값은 첫째 자리 그대로 */
export function fmt1(x: number): string {
  return x.toFixed(1);
}

/** 한 섞음의 두 걸음 값 — 테스트와 알고리즘이 같은 셈을 쓴다. */
export function boardSpots(data: BatchnormData, b: number): BnParts[] {
  return data.shuffles.map((order) => bnParts(data.xs, order, b, data.track, data.eps));
}

function checkData(data: BatchnormData): void {
  if (data.xs.length === 0) throw new Error('batchnorm: 값이 없다');
  if (data.shuffles.length === 0) throw new Error('batchnorm: 섞은 차례가 없다');
  for (const order of data.shuffles) {
    if (order.length !== data.xs.length) throw new Error('batchnorm: 섞은 차례의 길이가 값 수와 다르다');
    const seen = new Set(order);
    if (seen.size !== order.length || order.some((k) => !Number.isInteger(k) || k < 0 || k >= data.xs.length)) {
      throw new Error('batchnorm: 섞은 차례가 0‥n−1 의 섞음이 아니다');
    }
  }
  if (!data.batchLadder.includes(data.batch)) throw new Error(`batchnorm: 기본 묶음 크기 ${data.batch} 가 사다리에 없다`);
  for (const b of data.batchLadder) {
    if (data.xs.length % b !== 0) throw new Error(`batchnorm: 묶음 크기 ${b} 가 값 수를 나누지 못한다`);
  }
}

export async function batchnormAlgorithm(ctx: FacetContext<BatchnormData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BatchnormData>;
  const data = ctx.data;
  checkData(data);
  const whole = wholeParts(data.xs, data.track, data.eps);

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown = { drops: 0, 'batches-formed': 0 };
  const show = (name: 'drops' | 'batches-formed', value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  await ctx.emit({
    type: 'init',
    payload: {
      xs: [...data.xs],
      track: data.track,
      wholeSpot: whole.normed,
      wholeMean: whole.mu,
      stepMs: data.stepMs,
      shuffleCount: data.shuffles.length,
    },
    silent: true,
  });

  /** 한 판 — 끝까지 재생하면 true, 취소되면 false */
  const playBoard = async (b: number): Promise<boolean> => {
    show('drops', 0);
    show('batches-formed', 0);
    await ctx.emit({ type: 'board', payload: { batch: b } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    const perShuffle = data.xs.length / b;
    const spots: number[] = [];
    for (let s = 0; s < data.shuffles.length; s += 1) {
      if (ctx.cancelled) return false;
      const order = data.shuffles[s];
      if (order === undefined) throw new Error(`batchnorm: 섞음 ${s + 1} 이 없다`);
      const parts = bnParts(data.xs, order, b, data.track, data.eps);

      await phase('bn-gather');
      show('batches-formed', shown['batches-formed'] + perShuffle);
      await ctx.emit({ type: 'gather', payload: { shuffle: s + 1, batch: b, peers: parts.peers, mu: parts.mu } });
      if (!(await rctx.sleep(data.stepMs))) return false;

      spots.push(parts.normed);
      const last = s === data.shuffles.length - 1;
      await phase('bn-scale');
      show('drops', shown.drops + 1);
      await ctx.emit({
        type: 'scale',
        payload: {
          shuffle: s + 1,
          mu: parts.mu,
          sigma: parts.sigma,
          spot: parts.normed,
          last,
          meanDiff: last ? meanDiffOf(spots, whole.normed) : null,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    let b = data.batch;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playBoard(b))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'batch') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null && 'value' in p ? (p as { value: unknown }).value : undefined;
        if (typeof value !== 'number' || !data.batchLadder.includes(value)) {
          throw new Error(`batchnorm: 사다리에 없는 묶음 크기 — ${String(value)}`);
        }
        b = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
