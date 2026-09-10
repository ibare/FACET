/**
 * 주성분 분석 (PCA) — "가장 넓게 퍼진 방향" 은 무엇에 매여 있는가.
 *
 * 자료를 그대로 두고 풀면 주축이 가로에서 겨우 3° 기운다. 두 축을 각자의
 * 표준편차로 나눈 뒤 풀면 −45° 다. 같은 점 열둘인데 **42도가 돌아간다.**
 * 주성분은 자료에만 매인 것이 아니라 **축의 단위에도 매여 있다.**
 *
 * 푸는 방법은 거듭제곱 반복이다. 공분산을 곱하고 길이로 나누기를 되풀이하면
 * 가장 큰 고유벡터로 수렴한다. 몇 걸음에 멎는가가 고윳값의 차이를 말한다 —
 * 표준화 전에는 x 가 압도적이라 한 걸음, 표준화 뒤에는 네 걸음이다.
 *
 * ── 진행 모델
 *
 * `mechanismKind: 'reactive'`. 마운트 직후 원래 단위로 한 호흡 자동 시연하고,
 * 그 뒤로는 손잡이 입력을 기다린다. 재생 · 멈춤 · 한 걸음은 메커니즘이 지므로
 * (`ctx.sleep` 의 경계에서 멈추고 잇는다) 알고리즘은 손잡이 둘만 본다.
 *
 * ── 손잡이 (입력 어휘)
 *
 *   { type: 'standardize', payload: { value: 0 | 1 } }   틀을 바꾼다 → 다시 푼다
 *   { type: 'axis',        payload: { value: 1 | 2 } }   사영할 축 → 다시 푼다
 *
 * 그 밖의 입력은 흘린다.
 *
 * ── 식별자 (C1)
 *
 *   `frame:units`   지금 그리는 자료의 틀 (원래 단위 / 표준화)
 *   `matrix:cov`    그 틀에서 잰 공분산
 *   `vector:w`      공분산을 곱한 결과 (아직 길이가 남아 있다)
 *   `vector:v`      길이로 나눈 뒤의 단위 벡터
 *   `turn:step`     이번 걸음에 벡터가 돌아간 정도
 *   `axis:pick`     사영할 축과 그 축에 내려 찍은 자리
 *   `ledger:row`    한 틀의 답 한 줄 (앞서 본 것을 지우지 않고 쌓는다)
 *
 * ── 이벤트 (C2)
 *
 * 표준 어휘만 쓴다 — `state-changed` 하나에 위 target 을 붙여 가른다.
 * payload 스키마:
 *
 *   frame:units  { standardized: boolean; xs: number[]; ys: number[];
 *                  cx: number; cy: number }
 *   matrix:cov   { sxx: number; sxy: number; syy: number;
 *                  sdX: number; sdY: number; sdRatio: number }
 *   vector:w     { step: number; wx: number; wy: number; wLen: number }
 *   vector:v     { step: number; vx: number; vy: number; angleDeg: number }
 *   turn:step    { step: number; turn: number; converged: boolean }
 *   axis:pick    { axisIndex: 1 | 2; ax: number; ay: number; angleDeg: number;
 *                  share: number; t: number[] }
 *   ledger:row   { standardized: boolean; angleDeg: number; share: number;
 *                  steps: number }
 *
 *   phase        { phase: string }   silent: true (C3)
 *
 * ── phase 어휘 (C3 — `irs.ts` 와 글자까지 같다)
 *
 *   'center' | 'covariance' | 'multiply' | 'normalize' | 'measure-turn'
 *
 * ── 메트릭 (C5)
 *
 *   'power-step-count'  움직인 걸음 수 (1 / 4)
 *   'axis-angle-deg'    지금 축의 각도 (−2.98 / −45)
 *   'variance-share'    그 축이 담는 몫 (%)
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type PcaPoint = { x: number; y: number };

export type PcaData = {
  type: string;
  /** 점 열둘. 화면 자리는 stage 가 이 좌표에서 셈한다. */
  points: PcaPoint[];
  /** 거듭제곱 반복의 상한. 여기까지 가도 안 멎으면 손을 뗀다. */
  maxSteps: number;
  /** 이보다 덜 돌면 멎은 것으로 본다 (단위 벡터 두 끝 사이의 거리). */
  convergenceEpsilon: number;
  /** 걸음 사이의 쉼. 메커니즘이 여기서 멈추고 잇는다. */
  stepMs: number;
};

/** 손잡이 입력. `value` 는 segmented-slider 가 실어 보내는 구간 값이다. */
export type PcaInputEvent = ReactiveInputEvent & {
  payload?: { value?: number; segmentIndex?: number };
};

const DEFAULTS = { maxSteps: 24, convergenceEpsilon: 1e-4, stepMs: 380 } as const;

/** 걸음 사이의 문이 돌려주는 셋. 취소와 끼어듦을 하나로 겹치지 않는다 (C8). */
type Beat = 'ok' | 'cancelled' | 'interrupted';

type Cov = { meanX: number; meanY: number; sxx: number; sxy: number; syy: number };

/**
 * 가운데를 잡고 공분산을 잰다. `irs.ts` 의 `covariance` 와 같은 셈이며 `n` 으로
 * 나눈다.
 *
 * 이 함수와 아래 둘은 `ctx` 를 받지 않는 순수 셈이다 — 발신도 쉼도 없으므로
 * 취소를 볼 자리가 없다 (C8 은 발신 고리에 대한 조항이다).
 */
function covarianceOf(xs: number[], ys: number[]): Cov {
  const n = xs.length;
  if (n === 0) return { meanX: 0, meanY: 0, sxx: 0, sxy: 0, syy: 0 };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  return { meanX: mx, meanY: my, sxx: sxx / n, sxy: sxy / n, syy: syy / n };
}

/**
 * 거듭제곱 반복 한 걸음. `irs.ts` 의 진입점 `power_step` 과 같은 셈이다.
 * `v` 를 그 자리에서 갈고, 돌려주는 것은 **이번 걸음에 돌아간 정도**다.
 */
function powerStep(sxx: number, sxy: number, syy: number, v: number[]): number {
  const ox = v[0];
  const oy = v[1];
  const wx = sxx * v[0] + sxy * v[1];
  const wy = sxy * v[0] + syy * v[1];
  const m = Math.sqrt(wx * wx + wy * wy);
  v[0] = wx / m;
  v[1] = wy / m;
  const dx = v[0] - ox;
  const dy = v[1] - oy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 축 `(ax, ay)` 방향으로 자료가 얼마나 퍼졌는가 — 그 축의 고윳값. */
function varianceAlong(c: Cov, ax: number, ay: number): number {
  return ax * (c.sxx * ax + c.sxy * ay) + ay * (c.sxy * ax + c.syy * ay);
}

/** 화면에 뜨는 자리(소수 둘)까지만 남긴다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDegrees(y: number, x: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export const pca = async (ctx: FacetContext<PcaData>): Promise<void> => {
  const rc = ctx as ReactiveContext<PcaData>;
  const data = rc.data;
  const points = Array.isArray(data?.points) ? data.points : [];
  const stepMs = typeof data?.stepMs === 'number' ? data.stepMs : DEFAULTS.stepMs;
  const maxSteps = typeof data?.maxSteps === 'number' ? data.maxSteps : DEFAULTS.maxSteps;
  const eps =
    typeof data?.convergenceEpsilon === 'number'
      ? data.convergenceEpsilon
      : DEFAULTS.convergenceEpsilon;

  const rawXs = points.map((p) => p.x);
  const rawYs = points.map((p) => p.y);
  const rawCov = covarianceOf(rawXs, rawYs);
  const rawSdX = Math.sqrt(rawCov.sxx);
  const rawSdY = Math.sqrt(rawCov.syy);

  /**
   * 계기에 절대값을 얹는다.
   *
   * `ctx.metric` 은 더할 값만 받으므로 한 번에 `목표 − 지금값` 을 더하면 끝자리가
   * 어긋난다 (−45 를 거쳐 −2.98 로 돌아오면 −2.979999999999997 이 뜬다).
   * 먼저 0 으로 되돌린 뒤 값을 얹으면 그럴 일이 없다 — `x + (−x)` 는 언제나
   * 정확히 0 이고 `0 + v` 는 정확히 v 다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const cur = shown.get(name) ?? 0;
    if (cur !== 0) ctx.metric(name, -cur);
    if (value !== 0) ctx.metric(name, value);
    shown.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let standardized = false;
  let axisIndex: 1 | 2 = 1;
  /** 자동 시연 도중 들어온 손잡이 입력. 그 자리에서 접고 새 값으로 다시 센다. */
  let pending: PcaInputEvent | null = null;

  const isKnob = (event: ReactiveInputEvent): boolean =>
    event.type === 'standardize' || event.type === 'axis';

  /** 걸음 사이의 문. 쉼이 곧 취소 검사이며, 손잡이가 움직였으면 접는다 (C8). */
  const beat = async (): Promise<Beat> => {
    if (ctx.cancelled) return 'cancelled';
    const alive = await rc.sleep(stepMs);
    if (!alive) return 'cancelled';
    const polled = rc.pollInput<PcaInputEvent>();
    if (polled && isKnob(polled)) {
      pending = polled;
      return 'interrupted';
    }
    return 'ok';
  };

  // 지금 틀에서 푼 결과. 축만 갈아 끼울 때 다시 쓰려고 들고 있는다.
  let frameXs: number[] = [];
  let frameYs: number[] = [];
  let frameCov: Cov = { meanX: 0, meanY: 0, sxx: 0, sxy: 0, syy: 0 };
  let principal: number[] = [1, 0];

  /** 고른 축에 점들을 내려 찍는다. 다시 풀지 않고 그 값만 갈아 끼운다. */
  const project = async (): Promise<void> => {
    const [vx, vy] = principal;
    const ax = axisIndex === 1 ? vx : -vy;
    const ay = axisIndex === 1 ? vy : vx;
    const total = frameCov.sxx + frameCov.syy;
    const share = total > 0 ? (varianceAlong(frameCov, ax, ay) / total) * 100 : 0;
    const t = frameXs.map(
      (x, i) => (x - frameCov.meanX) * ax + (frameYs[i] - frameCov.meanY) * ay,
    );
    const angleDeg = toDegrees(ay, ax);
    await ctx.emit({
      type: 'state-changed',
      target: 'axis:pick',
      payload: { axisIndex, ax, ay, angleDeg: round2(angleDeg), share: round2(share), t },
    });
    setMetric('axis-angle-deg', round2(angleDeg));
    setMetric('variance-share', round2(share));
  };

  /** 지금 틀을 처음부터 푼다 — 가운데 · 공분산 · 거듭제곱 반복 · 사영. */
  const solve = async (): Promise<Beat> => {
    await phase('center');
    frameXs = standardized ? rawXs.map((x) => (x - rawCov.meanX) / rawSdX) : rawXs.slice();
    frameYs = standardized ? rawYs.map((y) => (y - rawCov.meanY) / rawSdY) : rawYs.slice();
    frameCov = covarianceOf(frameXs, frameYs);
    await ctx.emit({
      type: 'state-changed',
      target: 'frame:units',
      payload: {
        standardized,
        xs: frameXs.slice(),
        ys: frameYs.slice(),
        cx: frameCov.meanX,
        cy: frameCov.meanY,
      },
    });
    const framed = await beat();
    if (framed !== 'ok') return framed;

    await phase('covariance');
    const sdX = Math.sqrt(frameCov.sxx);
    const sdY = Math.sqrt(frameCov.syy);
    await ctx.emit({
      type: 'state-changed',
      target: 'matrix:cov',
      payload: {
        sxx: frameCov.sxx,
        sxy: frameCov.sxy,
        syy: frameCov.syy,
        sdX,
        sdY,
        sdRatio: sdY > 0 ? sdX / sdY : 0,
      },
    });
    const covered = await beat();
    if (covered !== 'ok') return covered;

    principal = [1, 0];
    setMetric('power-step-count', 0);
    let moved = 0;
    for (let step = 1; step <= maxSteps; step += 1) {
      if (ctx.cancelled) return 'cancelled';
      const ox = principal[0];
      const oy = principal[1];

      await phase('multiply');
      const wx = frameCov.sxx * ox + frameCov.sxy * oy;
      const wy = frameCov.sxy * ox + frameCov.syy * oy;
      await ctx.emit({
        type: 'state-changed',
        target: 'vector:w',
        payload: { step, wx, wy, wLen: Math.sqrt(wx * wx + wy * wy) },
      });
      const multiplied = await beat();
      if (multiplied !== 'ok') return multiplied;

      await phase('normalize');
      const turn = powerStep(frameCov.sxx, frameCov.sxy, frameCov.syy, principal);
      await ctx.emit({
        type: 'state-changed',
        target: 'vector:v',
        payload: {
          step,
          vx: principal[0],
          vy: principal[1],
          angleDeg: round2(toDegrees(principal[1], principal[0])),
        },
      });
      const normalized = await beat();
      if (normalized !== 'ok') return normalized;

      await phase('measure-turn');
      const converged = turn < eps;
      if (!converged) {
        moved += 1;
        setMetric('power-step-count', moved);
      }
      await ctx.emit({
        type: 'state-changed',
        target: 'turn:step',
        payload: { step, turn, converged },
      });
      const measured = await beat();
      if (measured !== 'ok') return measured;
      if (converged) break;
    }

    await project();
    const angle1 = round2(toDegrees(principal[1], principal[0]));
    const total = frameCov.sxx + frameCov.syy;
    const share1 =
      total > 0 ? (varianceAlong(frameCov, principal[0], principal[1]) / total) * 100 : 0;
    await ctx.emit({
      type: 'state-changed',
      target: 'ledger:row',
      payload: { standardized, angleDeg: angle1, share: round2(share1), steps: moved },
    });
    return beat();
  };

  /** 손잡이 하나를 받아 상태를 갈고, 다시 셈해야 하는지 말한다. */
  const applyKnob = (event: PcaInputEvent): boolean => {
    const value = event.payload?.value;
    if (typeof value !== 'number') return false;
    if (event.type === 'standardize') {
      const next = value >= 1;
      if (next === standardized) return false;
      standardized = next;
      return true;
    }
    if (event.type === 'axis') {
      const next: 1 | 2 = value >= 2 ? 2 : 1;
      if (next === axisIndex) return false;
      axisIndex = next;
      return true;
    }
    return false;
  };

  let needsSolve = true;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (needsSolve) {
        const outcome = await solve();
        if (outcome === 'cancelled') return;
        if (outcome === 'interrupted') {
          // 접힌 셈은 반쪽이다 — 축만 바뀌었어도 처음부터 다시 푼다.
          const knob = pending;
          pending = null;
          if (knob) applyKnob(knob);
          continue;
        }
        needsSolve = false;
      }
      const input = await rc.waitForInput<PcaInputEvent>();
      if (!isKnob(input)) continue;
      if (!applyKnob(input)) continue;
      if (input.type === 'axis') {
        // 축만 갈아 끼운다. 처음부터 재생하면 두 축을 견줄 수 없다.
        await project();
        continue;
      }
      needsSolve = true;
    }
  } catch (err) {
    // reset / destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
