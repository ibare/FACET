/**
 * momentum — 모멘텀 β 의 맞바꿈.
 *
 * 무게 하나 w 가 꺾인 손실(비탈 · 평지 · 그릇) 위를 모멘텀 갱신 `v ← β·v − η·g ; w ← w + v` 로 40 번 움직인다.
 * β 가 작으면 평지(g = 0)에 서고, 크면 평지를 건너지만 바닥 3.5 를 넘어서 출렁인다. 손잡이는 β 하나.
 *
 * 손실 (왼쪽 닫힘 구간):
 *   w < flatFrom            L = 3 − w                        g = −1   (비탈)
 *   flatFrom ≤ w < bowlFrom L = 1.9                          g = 0    (평지)
 *   w ≥ bowlFrom            L = 0.5(w − bottom)² + bottomLoss  g = w − bottom  (그릇)
 * 기울기는 언제나 갱신 앞 자리에서 셈한다. 셈은 IR `momentumRun` 과 같은 길(가지마다 풀어 쓴 꼴)이다.
 *
 * ── 이벤트 (silent 아닌 것이 한 걸음)
 *   start   걸음 0. 판 머리 — 앞 판의 자취 · 결론을 걷고 처음 자리를 놓는다.
 *           { beta, eta, steps, stepMs, w0, v0, loss0, flatFrom, bowlFrom, bottom, settleBand, axisTop, moveScale }
 *   update  갱신 한 번. { t, wPrev, w, loss, zone: 'slope'|'flat'|'bowl' (갱신 앞 w 의 구간),
 *           carried (β·v 앞), pushed (−η·g), v, plateau (지금까지 평지 갱신 수), pastBottom (지금까지 넘어선 갱신 수),
 *           final: boolean, summary? (final 일 때만) { crossAt: number|null, farW, farAt, overshoot: number|null,
 *           settleAt: number|null, endW, endL } }
 *   phase   silent. { phase } — 그 걸음의 발신 앞에 보낸다.
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   mom-slope · mom-flat · mom-bowl — 갱신 걸음에서 갱신 앞 w 의 구간. 걸음 0 에는 phase 가 없다.
 *
 * ── 계기 (누적 채널 — 지금 값을 들고 차이만 보낸다)
 *   plateau-updates      갱신 뒤 w 가 [flatFrom, bowlFrom) 인 갱신 수
 *   past-bottom-updates  갱신 뒤 w > bottom 인 갱신 수
 *
 * ── 동률 · 경계
 *   구간 경계 1.1 · 2.5 · 가라앉음 띠 끝 3.45 · 3.55 에 1e−6 안으로 닿는 w 는 이 데이터에 없다 (사양의 sim 단언).
 *   경계는 왼쪽 닫힘 그대로 비교한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MomentumData = {
  type: 'momentum';
  stepMs: number;
  betaLadder: number[];
  beta: number;
  eta: number;
  steps: number;
  w0: number;
  v0: number;
  flatFrom: number;
  bowlFrom: number;
  bottom: number;
  bottomLoss: number;
  settleBand: number;
  [key: string]: unknown;
};

export type Zone = 'slope' | 'flat' | 'bowl';

export type MomentumUpdate = {
  t: number;
  wPrev: number;
  w: number;
  loss: number;
  zone: Zone;
  carried: number;
  pushed: number;
  v: number;
  plateau: number;
  pastBottom: number;
};

export type MomentumSummary = {
  crossAt: number | null;
  farW: number;
  farAt: number;
  overshoot: number | null;
  settleAt: number | null;
  endW: number;
  endL: number;
};

/** start 걸음의 payload. */
export type MomentumStart = {
  beta: number;
  eta: number;
  steps: number;
  stepMs: number;
  w0: number;
  v0: number;
  loss0: number;
  flatFrom: number;
  bowlFrom: number;
  bottom: number;
  settleBand: number;
  axisTop: number;
  moveScale: number;
};

/** update 걸음의 payload. summary 는 final 일 때만 있다. */
export type MomentumStep = MomentumUpdate & { final: boolean; summary?: MomentumSummary };

export type MomentumRun = {
  updates: MomentumUpdate[];
  summary: MomentumSummary;
};

/** 자리 w 가 어느 구간인가 (왼쪽 닫힘). */
export function zoneOf(w: number, d: MomentumData): Zone {
  if (w < d.flatFrom) return 'slope';
  if (w < d.bowlFrom) return 'flat';
  return 'bowl';
}

/** 손실 L(w). */
export function lossAt(w: number, d: MomentumData): number {
  const z = zoneOf(w, d);
  if (z === 'slope') return 3 - w;
  if (z === 'flat') return 1.9;
  return 0.5 * (w - d.bottom) * (w - d.bottom) + d.bottomLoss;
}

/**
 * 한 판을 셈한다 — IR `momentumRun` 과 같은 길. 가지마다 풀어 쓴 꼴:
 *   비탈 v = β·v + η · 평지 v = β·v · 그릇 v = β·v − η·(w − bottom) ; w = w + v
 */
export function momentumCore(d: MomentumData, beta: number): MomentumRun {
  if (!Number.isInteger(d.steps) || d.steps < 1) throw new Error(`momentum: steps 가 1 이상의 정수가 아니다 (${d.steps})`);
  const updates: MomentumUpdate[] = [];
  let w = d.w0;
  let v = d.v0;
  let plateau = 0;
  let pastBottom = 0;
  for (let t = 1; t <= d.steps; t += 1) {
    const wPrev = w;
    const zone = zoneOf(w, d);
    const carried = beta * v;
    let pushed: number;
    if (zone === 'slope') {
      v = beta * v + d.eta;
      pushed = d.eta;
    } else if (zone === 'flat') {
      v = beta * v;
      pushed = 0;
    } else {
      v = beta * v - d.eta * (w - d.bottom);
      pushed = -d.eta * (wPrev - d.bottom);
    }
    w = w + v;
    const after = zoneOf(w, d);
    if (after === 'flat') plateau += 1;
    if (w > d.bottom) pastBottom += 1;
    updates.push({ t, wPrev, w, loss: lossAt(w, d), zone, carried, pushed, v, plateau, pastBottom });
  }
  return { updates, summary: summarize(updates, d) };
}

function summarize(updates: MomentumUpdate[], d: MomentumData): MomentumSummary {
  const last = updates[updates.length - 1];
  if (last === undefined) throw new Error('momentum: 갱신이 없다');
  let crossAt: number | null = null;
  let farW = d.w0;
  let farAt = 0;
  for (const u of updates) {
    if (crossAt === null && u.w >= d.bowlFrom) crossAt = u.t;
    if (u.w > farW) {
      farW = u.w;
      farAt = u.t;
    }
  }
  // 가라앉음@ — 그 갱신부터 끝까지 모든 |w − bottom| < settleBand 인 가장 이른 갱신 번호
  let settleAt: number | null = null;
  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const u = updates[i];
    if (u === undefined) throw new Error('momentum: 갱신 색인이 비었다');
    if (Math.abs(u.w - d.bottom) < d.settleBand) settleAt = u.t;
    else break;
  }
  const overshoot = farW > d.bottom ? farW - d.bottom : null;
  return { crossAt, farW, farAt, overshoot, settleAt, endW: last.w, endL: last.loss };
}

/** 사다리 전체에서 자취 · 움직임 막대가 들어갈 범위 — 판이 바뀌어도 축이 뛰지 않게 한 번 셈한다. */
export function momentumFrame(d: MomentumData): { axisTop: number; moveScale: number } {
  let wMax = Math.max(d.w0, d.bottom);
  let move = 0;
  for (const beta of d.betaLadder) {
    for (const u of momentumCore(d, beta).updates) {
      wMax = Math.max(wMax, u.w);
      move = Math.max(move, Math.abs(u.carried), Math.abs(u.carried + u.pushed), Math.abs(u.pushed));
    }
  }
  if (move <= 0) throw new Error('momentum: 움직임이 없다');
  return { axisTop: Math.ceil(wMax * 2) / 2, moveScale: move };
}

function isLadderValue(ladder: readonly number[], value: unknown): value is number {
  return typeof value === 'number' && ladder.includes(value);
}

export async function momentumAlgorithm(context: FacetContext<MomentumData>): Promise<void> {
  const ctx = context as ReactiveContext<MomentumData>;
  const d = ctx.data;
  if (!isLadderValue(d.betaLadder, d.beta)) throw new Error(`momentum: 처음 β ${String(d.beta)} 가 사다리에 없다`);
  const frame = momentumFrame(d);
  const shown = { plateau: false, past: false };
  const now = { plateau: 0, past: 0 };
  const setPlateau = (value: number): void => {
    const delta = value - now.plateau;
    if (delta !== 0 || !shown.plateau) ctx.metric('plateau-updates', delta);
    now.plateau = value;
    shown.plateau = true;
  };
  const setPast = (value: number): void => {
    const delta = value - now.past;
    if (delta !== 0 || !shown.past) ctx.metric('past-bottom-updates', delta);
    now.past = value;
    shown.past = true;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let beta = d.beta;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = momentumCore(d, beta);
      setPlateau(0);
      setPast(0);
      await ctx.emit({
        type: 'start',
        payload: {
          beta,
          eta: d.eta,
          steps: d.steps,
          stepMs: d.stepMs,
          w0: d.w0,
          v0: d.v0,
          loss0: lossAt(d.w0, d),
          flatFrom: d.flatFrom,
          bowlFrom: d.bowlFrom,
          bottom: d.bottom,
          settleBand: d.settleBand,
          axisTop: frame.axisTop,
          moveScale: frame.moveScale,
        },
      });
      if (!(await ctx.sleep(d.stepMs))) return;
      for (const u of run.updates) {
        if (ctx.cancelled) return;
        if (u.zone === 'slope') await phase('mom-slope');
        else if (u.zone === 'flat') await phase('mom-flat');
        else await phase('mom-bowl');
        setPlateau(u.plateau);
        setPast(u.pastBottom);
        const final = u.t === d.steps;
        await ctx.emit({
          type: 'update',
          payload: final ? { ...u, final, summary: run.summary } : { ...u, final },
        });
        if (!final && !(await ctx.sleep(d.stepMs))) return;
      }
      // 판이 끝났다 — 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'beta') continue;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (!isLadderValue(d.betaLadder, value)) throw new Error(`momentum: β 입력 ${String(value)} 가 사다리에 없다`);
        beta = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
