/**
 * one-batch-at-a-time — 같은 데이터 한 바퀴 동안 미니배치는 네 번, 전체는 한 번 옮긴다.
 *
 * 모형 ŷ = w·x (절편 없음). 두 쪽이 같은 처음 w0 · 같은 η 에서 출발한다.
 * 묶음은 섞은 차례 그대로 (`initialData.batches`) 하나씩 들어온다.
 *
 * - 미니배치: 묶음이 들어올 때마다 w ← w − η·g_묶음 (g 는 갱신 전 w 에서, 묶음 안 평균 2x(w·x − y))
 * - 전체: 점을 모으기만 하다가 마지막 묶음이 들어온 걸음에 여덟 점 평균 기울기로 한 번 갱신
 * - 견주는 손실은 두 쪽 다 여덟 점 전체의 평균 (ŷ − y)²
 *
 * 한 걸음 = 묶음 하나가 들어옴. 걸음 0 은 처음 모습 (silent init 이 채운다).
 *
 * 이벤트
 *   init   (silent) { w0: number; loss0: number; axis: { lo: number; hi: number; tick: number } }
 *            처음 w 와 그 자리의 전체 손실, w 축 범위(모든 갱신이 지나는 자리를 담는 눈금 단위 범위)
 *   batch  { k: number; idx: number[];
 *            mini: { g: number; from: number; to: number; loss: number };
 *            full: { kind: 'wait'; seen: number } | { kind: 'move'; seen: number; g: number; from: number; to: number; loss: number } }
 *            k 는 묶음 번호(1 부터), idx 는 그 묶음의 점 번호, loss 는 갱신 뒤 전체 손실,
 *            seen 은 전체 쪽이 지금까지 본 점의 개수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OneBatchAtATimeFacetData = {
  type: 'one-batch-at-a-time';
  stepMs: number;
  xs: number[];
  ys: number[];
  w0: number;
  eta: number;
  /** 섞은 차례 그대로의 묶음 — 점 번호의 열 */
  batches: number[][];
};

export type Axis = { lo: number; hi: number; tick: number };

export type FullMove =
  | { kind: 'wait'; seen: number }
  | { kind: 'move'; seen: number; g: number; from: number; to: number; loss: number };

export type BatchStep = {
  k: number;
  idx: number[];
  mini: { g: number; from: number; to: number; loss: number };
  full: FullMove;
};

export type PassPlan = {
  w0: number;
  loss0: number;
  axis: Axis;
  steps: BatchStep[];
};

const AXIS_TICK = 0.5;

function isNumArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면 · 무대도 이것을 부른다. */
export function narrowOneBatchData(raw: unknown): OneBatchAtATimeFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('one-batch-at-a-time: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'one-batch-at-a-time') throw new Error(`one-batch-at-a-time: initialData.type 이 다르다 (${String(r.type)})`);
  const { stepMs, xs, ys, w0, eta, batches } = r;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('one-batch-at-a-time: initialData.stepMs 가 양수가 아니다');
  if (!isNumArray(xs) || !isNumArray(ys)) throw new Error('one-batch-at-a-time: initialData.xs · ys 가 수의 배열이 아니다');
  if (xs.length === 0 || xs.length !== ys.length) throw new Error('one-batch-at-a-time: initialData.xs 와 ys 의 길이가 다르거나 비었다');
  if (typeof w0 !== 'number' || !Number.isFinite(w0)) throw new Error('one-batch-at-a-time: initialData.w0 가 수가 아니다');
  if (typeof eta !== 'number' || !(eta > 0)) throw new Error('one-batch-at-a-time: initialData.eta 가 양수가 아니다');
  if (!Array.isArray(batches) || batches.length === 0) throw new Error('one-batch-at-a-time: initialData.batches 가 비었다');
  const seen = new Set<number>();
  const out: number[][] = [];
  batches.forEach((b, bi) => {
    if (!isNumArray(b) || b.length === 0) throw new Error(`one-batch-at-a-time: initialData.batches[${bi}] 가 점 번호의 배열이 아니다`);
    for (const i of b) {
      if (!Number.isInteger(i) || i < 0 || i >= xs.length) {
        throw new Error(`one-batch-at-a-time: initialData.batches[${bi}] 의 점 번호 ${i} 가 범위 밖이다`);
      }
      if (seen.has(i)) throw new Error(`one-batch-at-a-time: initialData.batches[${bi}] 의 점 ${i} 가 두 번 들어 있다`);
      seen.add(i);
    }
    out.push([...b]);
  });
  if (seen.size !== xs.length) throw new Error('one-batch-at-a-time: initialData.batches 가 점을 한 번씩 다 담지 않는다');
  return { type: 'one-batch-at-a-time', stepMs, xs: [...xs], ys: [...ys], w0, eta, batches: out };
}

/** 점 번호 idx 위의 평균 (w·x − y)² */
export function meanLoss(d: OneBatchAtATimeFacetData, w: number, idx: readonly number[]): number {
  let s = 0;
  for (const i of idx) s += (w * d.xs[i]! - d.ys[i]!) ** 2;
  return s / idx.length;
}

/** 점 번호 idx 위의 평균 2x(w·x − y) */
export function meanGrad(d: OneBatchAtATimeFacetData, w: number, idx: readonly number[]): number {
  let s = 0;
  for (const i of idx) s += 2 * d.xs[i]! * (w * d.xs[i]! - d.ys[i]!);
  return s / idx.length;
}

/** 한 바퀴를 셈한다 — 묶음 차례를 돌며 두 쪽의 갱신을 쌓는다. */
export function planPass(d: OneBatchAtATimeFacetData): PassPlan {
  const all = d.xs.map((_, i) => i);
  let wm = d.w0;
  let wf = d.w0;
  let seen = 0;
  const visited: number[] = [d.w0];
  const steps: BatchStep[] = [];
  d.batches.forEach((b, j) => {
    const g = meanGrad(d, wm, b);
    const to = wm - d.eta * g;
    const mini = { g, from: wm, to, loss: meanLoss(d, to, all) };
    wm = to;
    visited.push(to);
    seen += b.length;
    let full: FullMove;
    if (j === d.batches.length - 1) {
      const gf = meanGrad(d, wf, all);
      const tf = wf - d.eta * gf;
      full = { kind: 'move', seen, g: gf, from: wf, to: tf, loss: meanLoss(d, tf, all) };
      wf = tf;
      visited.push(tf);
    } else {
      full = { kind: 'wait', seen };
    }
    steps.push({ k: j + 1, idx: [...b], mini, full });
  });
  const lo = Math.min(0, Math.floor(Math.min(...visited) / AXIS_TICK) * AXIS_TICK);
  const hi = Math.ceil(Math.max(...visited) / AXIS_TICK) * AXIS_TICK;
  if (!(hi > lo)) throw new Error('one-batch-at-a-time: w 축 범위를 정할 수 없다');
  return { w0: d.w0, loss0: meanLoss(d, d.w0, all), axis: { lo, hi, tick: AXIS_TICK }, steps };
}

/** 축 눈금 자리 — 바탕(축 범위)에서 정해지는 작은 셈. 무대가 부른다. */
export function axisTicks(axis: Axis): number[] {
  const n = Math.round((axis.hi - axis.lo) / axis.tick);
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const v = Math.round((axis.lo + i * axis.tick) * 1e6) / 1e6;
    out.push(Object.is(v, -0) ? 0 : v);
  }
  return out;
}

export async function oneBatchAtATime(context: FacetContext<OneBatchAtATimeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<OneBatchAtATimeFacetData>;
  const d = narrowOneBatchData(ctx.data);
  const plan = planPass(d);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(d.stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { w0: plan.w0, loss0: plan.loss0, axis: { ...plan.axis } },
  });

  for (const s of plan.steps) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'batch',
      payload: { k: s.k, idx: [...s.idx], mini: { ...s.mini }, full: { ...s.full } },
    });
  }
}
