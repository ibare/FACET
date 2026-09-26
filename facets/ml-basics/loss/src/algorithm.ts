/**
 * loss — 손실 함수의 모양이 미는 크기를 정한다.
 *
 * 답 y = 0 인 보기 하나에 출력 p = σ(z) 가 "1 일" 확률 p0 을 준 자리에서 출발해, 손실의 기울기
 * ∂L/∂z 로 z 를 갱신 열두 번 민다. 제곱 손실 L = (p − y)² 은 ∂L/∂z = 2(p − y)·p(1 − p) 라 확신할수록
 * σ′ 가 작아져 덜 밀고, 교차 엔트로피 L = −[y·ln p + (1 − y)·ln(1 − p)] 는 ∂L/∂z = p − y 라 확신할수록
 * 더 민다. 갱신은 z ← z − η·∂L/∂z (기울기는 갱신 전 자리).
 *
 * 셈은 `lossRun` 하나다 — IR `lossRun` 과 한 줄씩 같다. 알고리즘은 그것을 돌려 버퍼(p · ∂L/∂z · L)를
 * 채우고 갈고리 `onZ` 로 각 t 의 z 를 모은 뒤 걸음으로 푼다. 곡선 표본도 같은 함수를 steps 0 으로 불러 얻는다.
 *
 * ## 이벤트 (payload 스키마)
 * - `init` (silent) — 판 머리. 무대의 축과 곡선. 판마다 같은 값이다 (사다리 전체로 고정한 눈금).
 *     { zMin, zMax, zTicks: number[], curveZ: number[], curves: number[][] (종류마다 L 표본),
 *       lMax: number[] (종류마다 L 축 끝), lTicks: number[][], gMax, gTicks: number[], pTicks: number[], half }
 * - `start` (걸음 #0) — 처음 값. { kind, confidence, p0, z, p, L }
 * - `slope` (걸음 #1) — 갱신 전 자리의 미는 크기. { kind, z, p, L, g }
 * - `update` (걸음 #2 … #13) — 갱신 t 뒤의 값. { kind, t, steps, z, p, L, g, crossedAt: number | null, last: boolean }
 *     crossedAt = p 가 처음 0.5 아래로 내려온 갱신 번호 (아직 없으면 null)
 * - `phase` (silent) — { phase }
 *
 * ## phase 어휘 (irs.ts 와 같다)
 * - `measure` — p = σ(z) 와 L 을 잰다 (걸음 #0)
 * - `slope`   — ∂L/∂z 를 셈한다 (걸음 #1)
 * - `update`  — z ← z − η·∂L/∂z (걸음 #2 … #13)
 *
 * ## 계기
 * - `updates` — 이 판에서 한 갱신 수 (0 … 12). 판 머리에 0 으로 되돌린다
 *
 * 동률: 0.5 아래 판정은 p < 0.5 (엄격). 이 데이터의 p 는 0.5 에 닿지 않는다 (가장 가까운 값 제곱 0.7 갱신 3 의 0.495).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LossData = {
  type: 'loss';
  stepMs: number;
  /** 답 y (0 또는 1) */
  y: number;
  /** 배움률 η */
  eta: number;
  /** 갱신 수 */
  steps: number;
  /** 종류 목록 — 손잡이 lossKind 의 값 0.. 이 이 목록의 색인 */
  kinds: string[];
  /** 틀린 확신 사다리 p0 — 손잡이 confidence 의 값 0.. 이 이 사다리의 색인 */
  confidences: number[];
  /** 기본 종류 색인 */
  kindIndex: number;
  /** 기본 확신 색인 */
  confidenceIndex: number;
};

/** 곡선 표본 수 — 그리기 해상도 */
const CURVE_SAMPLES = 121;

/**
 * IR `lossRun` 과 한 줄씩 같은 셈. ps · gs · ls 는 길이 steps + 1.
 * onZ 는 t 마다 그 자리의 z 를 알린다 (화면이 z 를 보인다 — IR 은 z 를 버퍼에 두지 않는다).
 * 모르는 kind 는 던진다 (IR 은 −1.0 을 돌려준다).
 */
export function lossRun(
  kind: number,
  y: number,
  z0: number,
  eta: number,
  steps: number,
  ps: number[],
  gs: number[],
  ls: number[],
  onZ?: (t: number, z: number) => void,
): number {
  if (kind !== 0 && kind !== 1) throw new Error(`loss: 모르는 손실 종류 ${kind}`);
  let z = z0;
  let p = 0.0;
  for (let t = 0; t <= steps; t++) {
    if (onZ) onZ(t, z);
    p = 1.0 / (1.0 + Math.exp(-z));
    let L: number;
    let g: number;
    if (kind === 0) {
      L = (p - y) * (p - y);
      g = 2.0 * (p - y) * p * (1.0 - p);
    } else {
      L = -(y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p));
      g = p - y;
    }
    ps[t] = p;
    gs[t] = g;
    ls[t] = L;
    if (t < steps) z = z - eta * g;
  }
  return p;
}

/** z0 = ln(p0 / (1 − p0)) — σ(z0) = p0 이 되는 자리 */
export function logitOf(p0: number): number {
  if (!(p0 > 0 && p0 < 1)) throw new Error(`loss: 확률 밖의 p0 ${p0}`);
  return Math.log(p0 / (1.0 - p0));
}

/** 한 판의 셈 — 버퍼와 z 의 열 */
export type LossTrack = { zs: number[]; ps: number[]; gs: number[]; ls: number[]; last: number };

export function lossTrack(kind: number, y: number, p0: number, eta: number, steps: number): LossTrack {
  const ps = new Array<number>(steps + 1).fill(0);
  const gs = new Array<number>(steps + 1).fill(0);
  const ls = new Array<number>(steps + 1).fill(0);
  const zs = new Array<number>(steps + 1).fill(0);
  const last = lossRun(kind, y, logitOf(p0), eta, steps, ps, gs, ls, (t, z) => {
    zs[t] = z;
  });
  return { zs, ps, gs, ls, last };
}

/** p 가 처음 0.5 아래로 내려온 갱신 번호 (1..upTo), 없으면 null */
export function firstBelowHalf(ps: readonly number[], upTo: number): number | null {
  for (let t = 1; t <= upTo; t++) {
    const p = ps[t];
    if (p === undefined) throw new Error(`loss: 갱신 ${t} 의 p 가 없다`);
    if (p < 0.5) return t;
  }
  return null;
}

export type LossAxes = {
  zMin: number;
  zMax: number;
  zTicks: number[];
  curveZ: number[];
  curves: number[][];
  lMax: number[];
  lTicks: number[][];
  gMax: number;
  gTicks: number[];
  pTicks: number[];
  half: number;
};

/** 사다리 전체(종류 × 확신)를 돌려 축을 고정한다 — 판 사이에 축이 바뀌지 않게 */
export function lossAxes(data: LossData): LossAxes {
  let zLo = Infinity;
  let zHi = -Infinity;
  const lHi = data.kinds.map(() => 0);
  let gHi = 0;
  data.kinds.forEach((_, kind) => {
    for (const p0 of data.confidences) {
      const tr = lossTrack(kind, data.y, p0, data.eta, data.steps);
      for (const z of tr.zs) {
        zLo = Math.min(zLo, z);
        zHi = Math.max(zHi, z);
      }
      for (const L of tr.ls) lHi[kind] = Math.max(lHi[kind] ?? 0, L);
      for (const g of tr.gs) gHi = Math.max(gHi, Math.abs(g));
    }
  });
  const zMin = Math.floor(zLo);
  const zMax = Math.ceil(zHi);
  const zTicks: number[] = [];
  for (let z = zMin; z <= zMax; z++) zTicks.push(z);

  const curveZ: number[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i++) curveZ.push(zMin + ((zMax - zMin) * i) / (CURVE_SAMPLES - 1));
  // 곡선 표본 — 같은 셈(lossRun)을 갱신 0 번으로 불러 L 만 받는다
  const curves = data.kinds.map((_, kind) =>
    curveZ.map((z) => {
      const ps = [0];
      const gs = [0];
      const ls = [0];
      lossRun(kind, data.y, z, data.eta, 0, ps, gs, ls);
      const L = ls[0];
      if (L === undefined) throw new Error('loss: 곡선 표본이 비었다');
      return L;
    }),
  );

  const lMax = lHi.map((v) => Math.ceil(v));
  // 끝이 1 이면 네 칸, 그 위면 1 씩
  const lTicks = lMax.map((m) => {
    const step = m <= 1 ? 0.25 : 1;
    const out: number[] = [];
    for (let i = 0; i * step <= m + 1e-9; i++) out.push(i * step);
    return out;
  });
  const gMax = Math.ceil(gHi);
  return {
    zMin,
    zMax,
    zTicks,
    curveZ,
    curves,
    lMax,
    lTicks,
    gMax,
    gTicks: [0, gMax / 2, gMax],
    pTicks: [0, 0.5, 1],
    half: 0.5,
  };
}

function ladderOk(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

export async function lossAlgorithm(ctx: FacetContext<LossData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LossData>;
  const data = ctx.data;
  if (!ladderOk(data.kindIndex, data.kinds.length)) throw new Error('loss: 기본 종류가 사다리 밖');
  if (!ladderOk(data.confidenceIndex, data.confidences.length)) throw new Error('loss: 기본 확신이 사다리 밖');

  let kind = data.kindIndex;
  let conf = data.confidenceIndex;
  const axes = lossAxes(data);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    const prev = shown[name];
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (): Promise<boolean> => {
    const p0 = data.confidences[conf];
    if (p0 === undefined) throw new Error('loss: 확신 사다리 밖');
    const tr = lossTrack(kind, data.y, p0, data.eta, data.steps);
    const at = (arr: readonly number[], t: number): number => {
      const v = arr[t];
      if (v === undefined) throw new Error(`loss: 버퍼 ${t} 가 비었다`);
      return v;
    };

    setMetric('updates', 0);
    await ctx.emit({ type: 'init', payload: axes, silent: true });

    // 걸음 #0 — 처음 값
    await phase('measure');
    await ctx.emit({
      type: 'start',
      payload: { kind, confidence: conf, p0, z: at(tr.zs, 0), p: at(tr.ps, 0), L: at(tr.ls, 0) },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 #1 — 갱신 전 자리의 미는 크기
    if (ctx.cancelled) return false;
    await phase('slope');
    await ctx.emit({
      type: 'slope',
      payload: { kind, z: at(tr.zs, 0), p: at(tr.ps, 0), L: at(tr.ls, 0), g: at(tr.gs, 0) },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 #2 … — 갱신 t 뒤
    for (let t = 1; t <= data.steps; t++) {
      if (ctx.cancelled) return false;
      await phase('update');
      setMetric('updates', t);
      await ctx.emit({
        type: 'update',
        payload: {
          kind,
          t,
          steps: data.steps,
          z: at(tr.zs, t),
          p: at(tr.ps, t),
          L: at(tr.ls, t),
          g: at(tr.gs, t),
          crossedAt: firstBelowHalf(tr.ps, t),
          last: t === data.steps,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun())) return;
      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null && 'value' in payload
            ? (payload as { value: unknown }).value
            : undefined;
        if (input.type === 'lossKind') {
          if (!ladderOk(value, data.kinds.length)) throw new Error(`loss: lossKind 값이 사다리 밖 ${String(value)}`);
          kind = value;
          break;
        }
        if (input.type === 'confidence') {
          if (!ladderOk(value, data.confidences.length)) throw new Error(`loss: confidence 값이 사다리 밖 ${String(value)}`);
          conf = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
