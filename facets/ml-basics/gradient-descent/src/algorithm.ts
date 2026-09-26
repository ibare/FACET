/**
 * 경사 하강 — 어느 바닥에 서는가.
 *
 * 두 바닥 곡선 L(w) = w⁴ − 2w² + 0.5w 위에서 경사 하강 `w ← w − η·g` 를 돌린다. 학습률 η 와
 * 출발 w₀ 두 손잡이가 함께 끝에 선 바닥을 고른다. 손잡이 값 하나로 처음부터 끝까지 한 번 재생하는
 * 것이 한 판이고, 판이 끝나면 입력을 기다린다.
 *
 * ── 걸음
 *   걸음 0     출발 자리 (w · L · g)
 *   갱신 걸음  갱신 한 번 (기울기는 갱신 전 자리에서 셈한다)
 *   끝 걸음    어디에 섰나 (깊은 바닥 · 얕은 바닥 · 못 멈춤 · 곡선 밖)
 *
 * ── 멈춤 규약 (IR `descend` 와 같은 길)
 *   갱신 앞 자리의 |g| < stopBelow 이면 멈춘다 · 갱신 상한 maxSteps · 갱신 뒤 |w| > blowUp 이면 곡선 밖.
 *   끝난 모양: |w| > blowUp → 곡선 밖 · |g(w)| < stopBelow → 깊은 바닥 쪽이면 깊은 바닥, 아니면 얕은 바닥 ·
 *   그 밖 → 못 멈춤 (상한).
 *
 * ── 동률 규칙
 *   격자 훑기에서 이웃과 같은 L 은 바닥 · 언덕으로 치지 않는다 (엄격한 부등호). 두 바닥의 L 이 같으면
 *   깊은 바닥을 가를 수 없어 던진다. 이 데이터에서는 걸리지 않는다 (바닥 둘 · 언덕 하나가 모두 엄격).
 *   언덕 넘음은 갱신 앞뒤 자리가 언덕 w 의 서로 다른 편(< 대 ≥)일 때다 — 언덕 w 에 정확히 닿는 자리는 없다.
 *
 * ── 이벤트 (payload 스키마)
 *   init    silent  { stepMs, eta, start, window: { wMin, wMax, lMin, lMax }, samples: [w, L][],
 *                     deep: { w, loss }, shallow: { w, loss }, hump: { w, loss } }
 *   start           { w, loss, grad, eta }
 *   update          { t, from, to, grad, loss, inWindow, crossed }
 *   settle          { outcome: 'deep' | 'shallow' | 'cap' | 'blowup', t, w, loss, absGrad, inWindow,
 *                     pair: [{ w, loss }, { w, loss }] | null, stopBelow }   // pair = 못 멈춤일 때 끝 두 자리
 *   phase   silent  { phase }
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   gd-update · gd-stop · gd-blowup · gd-cap
 *   걸음 0 에는 켜지는 phase 가 없다 (projector 가 판 머리에 코드 패널을 끈다).
 *
 * ── 계기
 *   updates         이 판의 갱신 수 (갱신 걸음마다 +1)
 *   hump-crossings  갱신 앞뒤 자리가 언덕의 다른 편인 갱신 수
 *   둘 다 판 머리에 0 으로 돌린다 (차이로).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GradientDescentData = {
  type: 'gradient-descent';
  stepMs: number;
  etaLadder: number[];
  eta: number;
  startLadder: number[];
  start: number;
  maxSteps: number;
  stopBelow: number;
  blowUp: number;
  gridFrom: number;
  gridTo: number;
  gridDiv: number;
  /** 곡선 단면 창의 L 윗끝 (그림 틀). 곡선은 이 위로 잘린다 */
  lossTop: number;
};

export type Outcome = 'deep' | 'shallow' | 'cap' | 'blowup';

export type Spot = { w: number; loss: number };

export type Landscape = {
  samples: [number, number][];
  deep: Spot;
  shallow: Spot;
  hump: Spot;
  window: { wMin: number; wMax: number; lMin: number; lMax: number };
};

export type Descent = {
  /** path[0] = 출발, path[t] = 갱신 t 뒤 자리 */
  path: number[];
  /** grads[t-1] = 갱신 t 앞 자리의 기울기 */
  grads: number[];
  t: number;
};

/** 손실 곡선 — 모형이다 (IR 도 같은 식을 가진다). */
export function lossAt(w: number): number {
  return w * w * w * w - 2 * w * w + 0.5 * w;
}

/** 기울기 g = 4w³ − 4w + 0.5 */
export function gradAt(w: number): number {
  return 4 * w * w * w - 4 * w + 0.5;
}

/** 표시 찍개 — 셈은 전 정밀도, 표시만 자리수로. 음수는 수학 빼기 표로. */
export function fx(v: number, digits: number): string {
  if (!Number.isFinite(v)) throw new Error(`찍을 수 없는 수: ${String(v)}`);
  return v.toFixed(digits).replace('-', '−');
}

/** 격자 w_i = i / gridDiv (i 는 정수) — 바탕에서 정해지는 작은 셈이라 무대도 부를 수 있다. */
export function gridPoints(data: Pick<GradientDescentData, 'gridFrom' | 'gridTo' | 'gridDiv'>): number[] {
  const out: number[] = [];
  for (let i = data.gridFrom; i <= data.gridTo; i++) out.push(i / data.gridDiv);
  return out;
}

/** 격자를 훑어 두 바닥과 언덕을 찾는다. 바닥 둘 · 언덕 하나가 아니면 던진다. */
export function scanLandscape(data: GradientDescentData): Landscape {
  const ws = gridPoints(data);
  if (ws.length < 3) throw new Error('격자가 너무 작다');
  const ls = ws.map(lossAt);
  const minima: Spot[] = [];
  const maxima: Spot[] = [];
  for (let i = 1; i < ws.length - 1; i++) {
    const l = ls[i]!;
    if (l < ls[i - 1]! && l < ls[i + 1]!) minima.push({ w: ws[i]!, loss: l });
    if (l > ls[i - 1]! && l > ls[i + 1]!) maxima.push({ w: ws[i]!, loss: l });
  }
  if (minima.length !== 2 || maxima.length !== 1) {
    throw new Error(`바닥 ${minima.length} 개 · 언덕 ${maxima.length} 개 — 두 바닥 곡선이 아니다`);
  }
  const [a, b] = minima as [Spot, Spot];
  if (a.loss === b.loss) throw new Error('두 바닥의 L 이 같아 깊은 바닥을 가를 수 없다');
  const deep = a.loss < b.loss ? a : b;
  const shallow = a.loss < b.loss ? b : a;
  const hump = maxima[0]!;
  let lMin = Infinity;
  for (const l of ls) if (l < lMin) lMin = l;
  return {
    samples: ws.map((w, i) => [w, ls[i]!]),
    deep,
    shallow,
    hump,
    window: { wMin: ws[0]!, wMax: ws[ws.length - 1]!, lMin, lMax: data.lossTop },
  };
}

/** 경사 하강 한 판 — IR `descend` 와 같은 길. */
export function descend(start: number, eta: number, maxSteps: number, stopBelow: number, blowUp: number): Descent {
  const path = [start];
  const grads: number[] = [];
  let w = start;
  let t = 0;
  while (t < maxSteps) {
    const g = gradAt(w);
    if (Math.abs(g) < stopBelow) return { path, grads, t };
    w = w - eta * g;
    t = t + 1;
    grads.push(g);
    path.push(w);
    if (Math.abs(w) > blowUp) return { path, grads, t };
  }
  return { path, grads, t };
}

/** 끝난 모양 — 끝 자리에서 판정한다. */
export function outcomeOf(w: number, land: Landscape, stopBelow: number, blowUp: number): Outcome {
  if (Math.abs(w) > blowUp) return 'blowup';
  if (Math.abs(gradAt(w)) < stopBelow) {
    const deepLeft = land.deep.w < land.hump.w;
    return (w < land.hump.w) === deepLeft ? 'deep' : 'shallow';
  }
  return 'cap';
}

/** 갱신 앞뒤 자리가 언덕의 다른 편인가. */
export function crossesHump(from: number, to: number, humpW: number): boolean {
  return from < humpW !== to < humpW;
}

/** 한 판을 셈해 둔다 — 재생과 테스트가 같은 값을 본다. */
export function planRun(data: GradientDescentData, eta: number, start: number) {
  const land = scanLandscape(data);
  const run = descend(start, eta, data.maxSteps, data.stopBelow, data.blowUp);
  const last = run.path[run.t]!;
  const outcome = outcomeOf(last, land, data.stopBelow, data.blowUp);
  let crossings = 0;
  for (let i = 1; i <= run.t; i++) if (crossesHump(run.path[i - 1]!, run.path[i]!, land.hump.w)) crossings++;
  return { land, run, last, outcome, crossings };
}

function inLadder(ladder: number[], v: number): boolean {
  return ladder.some((x) => x === v);
}

export async function gradientDescentAlgorithm(ctx0: FacetContext<GradientDescentData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<GradientDescentData>;
  const data = ctx.data;
  if (data.type !== 'gradient-descent') throw new Error(`모르는 자료: ${String(data.type)}`);
  if (!inLadder(data.etaLadder, data.eta)) throw new Error('η 기본값이 사다리에 없다');
  if (!inLadder(data.startLadder, data.start)) throw new Error('출발 기본값이 사다리에 없다');

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = new Map<string, number>([
    ['updates', 0],
    ['hump-crossings', 0],
  ]);
  const setMetric = (name: string, value: number) => {
    const cur = shown.get(name);
    if (cur === undefined) throw new Error(`선언하지 않은 계기: ${name}`);
    ctx.metric(name, value - cur);
    shown.set(name, value);
  };

  let eta = data.eta;
  let start = data.start;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const plan = planRun(data, eta, start);
      const { land, run } = plan;
      const win = land.window;
      const inWin = (w: number) => w >= win.wMin && w <= win.wMax;

      await ctx.emit({
        type: 'init',
        payload: {
          stepMs: data.stepMs,
          eta,
          start,
          window: win,
          samples: land.samples,
          deep: land.deep,
          shallow: land.shallow,
          hump: land.hump,
        },
        silent: true,
      });
      setMetric('updates', 0);
      setMetric('hump-crossings', 0);

      // 걸음 0 — 출발 자리
      await ctx.emit({ type: 'start', payload: { w: start, loss: lossAt(start), grad: gradAt(start), eta } });
      if (!(await ctx.sleep(data.stepMs))) return;

      let crossings = 0;
      for (let t = 1; t <= run.t; t++) {
        if (ctx.cancelled) return;
        const from = run.path[t - 1]!;
        const to = run.path[t]!;
        const crossed = crossesHump(from, to, land.hump.w);
        if (crossed) crossings++;
        await phase('gd-update');
        await ctx.emit({
          type: 'update',
          payload: { t, from, to, grad: run.grads[t - 1]!, loss: lossAt(to), inWindow: inWin(to), crossed },
        });
        setMetric('updates', t);
        setMetric('hump-crossings', crossings);
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      // 끝 걸음 — 어디에 섰나
      const last = plan.last;
      if (plan.outcome === 'blowup') await phase('gd-blowup');
      else if (plan.outcome === 'cap') await phase('gd-cap');
      else await phase('gd-stop');
      const pair: [Spot, Spot] | null =
        plan.outcome === 'cap'
          ? [
              { w: run.path[run.t - 1]!, loss: lossAt(run.path[run.t - 1]!) },
              { w: last, loss: lossAt(last) },
            ]
          : null;
      await ctx.emit({
        type: 'settle',
        payload: {
          outcome: plan.outcome,
          t: run.t,
          w: last,
          loss: lossAt(last),
          absGrad: Math.abs(gradAt(last)),
          inWindow: inWin(last),
          pair,
          stopBelow: data.stopBelow,
        },
      });

      // 입력 대기 — 우리 손잡이만 받는다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'eta' && input.type !== 'start') continue;
        const p = input.payload as { value?: unknown } | undefined;
        const value = p?.value;
        if (typeof value !== 'number') throw new Error(`손잡이 값이 수가 아니다: ${String(value)}`);
        if (input.type === 'eta') {
          if (!inLadder(data.etaLadder, value)) throw new Error(`η 사다리에 없는 값: ${value}`);
          eta = value;
        } else {
          if (!inLadder(data.startLadder, value)) throw new Error(`출발 사다리에 없는 값: ${value}`);
          start = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
