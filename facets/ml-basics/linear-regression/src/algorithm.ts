/**
 * 선형 회귀 (linear regression) facet 알고리즘 — ReactiveMechanism + 자동 시연 루프.
 *
 * 시그니처 행동: 점 무리에 직선 한 줄을 끼우되, 잔차의 제곱을 면적으로 환원해
 * 그 면적의 합이 가장 작아지도록 직선을 매 반복마다 한 걸음씩 회전·이동시키는
 * 학습 운동. 데이터 평면의 직선·잔차 사각형 운동과 매개변수 평면의 굴러가는
 * 점 운동이 같은 시간축으로 1:1 동기된다.
 *
 * 진행 모델: 시간 진행형. mount 직후 한 호흡 자동 시연 (수렴 또는 발산 시점까지)
 * 후 idle 상태로 떨어진다. idle 에서는 play / step / reset / lr 입력 대기.
 * play 자동 진행 중 pollInput 으로 인터럽트 (pause / lr / reset) 를 매 step 사이에
 * 검사한다.
 *
 * 입력 (모두 facet 로컬, 'reset' 은 mechanism 표준):
 *   - play                payload?: unknown
 *                         자동 진행 시작 (수렴 또는 발산까지).
 *   - pause               payload?: unknown
 *                         자동 진행 즉시 정지 (현재 (w, b) 보존).
 *   - step                payload?: unknown
 *                         정확히 한 스텝 진행.
 *   - lr                  payload: { value: number, segmentIndex: number }
 *                         학습률 변경. 다음 스텝부터 적용.
 *
 * 식별자 (C1):
 *   - `point:i`                       — 데이터 점 i (i = 0..n-1).
 *   - `line:hypothesis`               — 가설 직선.
 *   - `square:i`                      — 잔차 정사각형 i.
 *   - `param:current`                 — 매개변수 평면 위 현재 (w, b) 점.
 *   - `param:trail`                   — 발자국 궤적.
 *   - `loss:curve`                    — 손실 곡선.
 *   - `flag:converged`                — 수렴 깃발.
 *
 * 이벤트 어휘 (모두 facet 로컬):
 *   - init                payload: { points, w, b, t, rss, residualSum, lr,
 *                                    lrSegment, history, contour }
 *                         mount 즉시 + reset 시 1회.
 *   - step-begin          payload: { t, w, b, lr }
 *                         한 스텝 운동 시작 펄스.
 *   - step-end            payload: { t, w, b, prevW, prevB, rss, prevRss,
 *                                    residualSum, gradW, gradB }
 *                         한 스텝 운동 끝. stage 가 직선 / 사각형 / 점 이동을 발화.
 *   - converged           payload: { t, w, b, rss }
 *                         |Δ RSS| < ε 첫 스텝. 깃발이 꽂히고 자동 진행 정지.
 *   - diverged            payload: { t, w, b, rss }
 *                         발산 자동 정지 발화.
 *   - lr-changed          payload: { value, segmentIndex }
 *                         학습률 segmented-slider 변경 즉시 발화.
 *   - reset-state         payload: { points, w, b, lr }
 *                         mechanism reset 직후 + 'reset' 입력 시 발화.
 *   - mode                payload: { mode: 'auto' | 'idle' }, silent: true
 *                         자동 시연 진입/종료 메타.
 *   - phase               payload: { phase: 'sequence' | 'idle' }, silent: true
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type Point = { x: number; y: number };

export type LrSegment = {
  /** 학습률 값 (0.01 ~ 0.30 범위 권장). */
  value: number;
  /** 라벨용 식별 — 'slow' | 'tuned' | 'diverge' 등. */
  id: string;
};

export type LinearRegressionData = {
  type: 'linear-regression';
  /** 14 ~ 18 점, 고정 시드. */
  points: Point[];
  /** 초기 (w, b). 골짜기 중심에서 떨어진 자리. */
  initialW: number;
  initialB: number;
  /** 학습률 후보 3구간 — 느림 / 적정 / 발산. */
  lrSegments: LrSegment[];
  /** 초기 선택 segmentIndex (0-based). */
  initialLrIndex: number;
  /** 진행 박자. */
  timings: {
    /** 한 스텝 사이의 자동 진행 간격 (ms). */
    autoStepIntervalMs: number;
    /** 한 스텝 운동 (직선·점·사각형 이동) 길이 (ms). 시각용 메타. */
    stepDurationMs: number;
    /** 발산 자동 정지 짧은 펄스 (ms). */
    divergePulseMs: number;
  };
  /** 수렴 임계 ε — |Δ RSS| < ε. */
  convergenceEpsilon: number;
  /** 안전 상한 — 최대 자동 시연 스텝 수. */
  maxAutoSteps: number;
  /** 매개변수 평면 등고선 단계 수. */
  contourLevels: number;
  /** 매개변수 평면 (w, b) 시각 범위 — [wMin, wMax, bMin, bMax]. */
  paramRange: [number, number, number, number];
};

export type LinearRegressionInputEvent =
  | { type: 'play'; payload?: unknown }
  | { type: 'pause'; payload?: unknown }
  | { type: 'step'; payload?: unknown }
  | { type: 'lr'; payload?: { value?: number; segmentIndex?: number } };

// ── 통계 / 산수 ─────────────────────────────────────────────────────────────

function predict(w: number, b: number, x: number): number {
  return w * x + b;
}

function computeResiduals(points: Point[], w: number, b: number): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.y - predict(w, b, p.x));
  return out;
}

function rssOf(residuals: number[]): number {
  let s = 0;
  for (const r of residuals) s += r * r;
  return s;
}

function residualSumOf(residuals: number[]): number {
  let s = 0;
  for (const r of residuals) s += r;
  return s;
}

/** 손실 L = (1/2n) Σ (y - (w x + b))^2 의 (w, b) 편미분. */
function gradient(
  points: Point[],
  w: number,
  b: number,
): { gw: number; gb: number } {
  const n = points.length;
  let gw = 0;
  let gb = 0;
  for (const p of points) {
    const err = predict(w, b, p.x) - p.y; // (예측 - 정답)
    gw += err * p.x;
    gb += err;
  }
  return { gw: gw / n, gb: gb / n };
}

// ── 알고리즘 본체 ─────────────────────────────────────────────────────────

export async function linearRegression(
  ctxBase: FacetContext<LinearRegressionData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<LinearRegressionData>;
  const data = ctx.data;
  const { points, lrSegments, timings, convergenceEpsilon, maxAutoSteps } = data;

  let w = data.initialW;
  let b = data.initialB;
  let t = 0;
  let lrIndex = Math.max(0, Math.min(lrSegments.length - 1, data.initialLrIndex));
  let lr = lrSegments[lrIndex]!.value;

  let residuals = computeResiduals(points, w, b);
  let rss = rssOf(residuals);
  const initialRss = rss;
  let prevRss = rss;

  let converged = false;
  let diverged = false;

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: {
      points,
      w,
      b,
      t,
      rss,
      residualSum: residualSumOf(residuals),
      lr,
      lrSegmentIndex: lrIndex,
      lrSegments,
      contourLevels: data.contourLevels,
      paramRange: data.paramRange,
      epsilon: convergenceEpsilon,
    },
  });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  /** 한 스텝 진행 — 이벤트는 internal helper 가 발화. */
  async function stepOnce(): Promise<'ok' | 'converged' | 'diverged' | 'cancelled'> {
    if (ctx.cancelled) return 'cancelled';
    const prevW = w;
    const prevB = b;
    prevRss = rss;

    await ctx.emit({
      type: 'step-begin',
      payload: { t: t + 1, w: prevW, b: prevB, lr },
    });

    const { gw, gb } = gradient(points, w, b);
    w = w - lr * gw;
    b = b - lr * gb;
    t += 1;

    residuals = computeResiduals(points, w, b);
    const newRss = rssOf(residuals);
    const residualSum = residualSumOf(residuals);

    // 발산 감지 — RSS 폭증 또는 비유한값.
    const blowup =
      !Number.isFinite(newRss) ||
      newRss > initialRss * 10 ||
      (prevRss > 1e-9 && newRss > prevRss * 5 && newRss > initialRss);

    rss = newRss;

    await ctx.emit({
      type: 'step-end',
      payload: {
        t,
        w,
        b,
        prevW,
        prevB,
        rss,
        prevRss,
        residualSum,
        gradW: gw,
        gradB: gb,
      },
    });

    if (blowup) {
      diverged = true;
      await ctx.emit({
        type: 'diverged',
        payload: { t, w, b, rss },
      });
      return 'diverged';
    }

    const delta = Math.abs(rss - prevRss);
    if (delta < convergenceEpsilon && t > 1) {
      converged = true;
      await ctx.emit({
        type: 'converged',
        payload: { t, w, b, rss },
      });
      return 'converged';
    }

    return 'ok';
  }

  /**
   * 자동 시연 한 호흡 — pollInput 으로 매 sleep 후 인터럽트 검사.
   * 인터럽트가 들어오면 큐로 다시 push 할 길이 없으므로 즉시 처리하고 종료.
   */
  async function autoRun(): Promise<LinearRegressionInputEvent | null> {
    await ctx.emit({ type: 'mode', payload: { mode: 'auto' }, silent: true });
    await ctx.emit({ type: 'phase', payload: { phase: 'sequence' }, silent: true });

    let safety = maxAutoSteps;
    while (safety-- > 0) {
      if (ctx.cancelled) return null;
      if (converged || diverged) break;

      const r = await stepOnce();
      if (r === 'cancelled') return null;
      if (r === 'converged' || r === 'diverged') break;

      const ok = await ctx.sleep(timings.autoStepIntervalMs);
      if (!ok || ctx.cancelled) return null;

      // 인터럽트 검사 — pause / lr / step 등이 큐에 쌓였으면 중단.
      const pending = ctx.pollInput<LinearRegressionInputEvent>();
      if (pending) {
        await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
        await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
        return pending;
      }
    }

    await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
    await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
    return null;
  }

  // mount 직후 한 호흡 자동 시연.
  let interrupted = await autoRun();

  // 1. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;

    let ev: LinearRegressionInputEvent;
    if (interrupted) {
      ev = interrupted;
      interrupted = null;
    } else {
      try {
        ev = await ctx.waitForInput<LinearRegressionInputEvent>();
      } catch {
        return;
      }
    }

    if (ev.type === 'pause') {
      // pause 자체는 자동 진행을 중단시키는 신호. autoRun 안에서 인터럽트로 잡혔거나,
      // idle 상태라면 no-op. 어느 경우든 상태 보존.
      continue;
    }

    if (ev.type === 'lr') {
      const idxRaw = ev.payload?.segmentIndex;
      const valueRaw = ev.payload?.value;
      let nextIdx = lrIndex;
      if (typeof idxRaw === 'number' && idxRaw >= 0 && idxRaw < lrSegments.length) {
        nextIdx = Math.floor(idxRaw);
      } else if (typeof valueRaw === 'number') {
        // value 우선 매칭.
        let best = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < lrSegments.length; i++) {
          const d = Math.abs(lrSegments[i]!.value - valueRaw);
          if (d < bestDiff) {
            bestDiff = d;
            best = i;
          }
        }
        nextIdx = best;
      }
      lrIndex = nextIdx;
      lr = lrSegments[lrIndex]!.value;
      await ctx.emit({
        type: 'lr-changed',
        payload: { value: lr, segmentIndex: lrIndex },
      });
      continue;
    }

    if (ev.type === 'step') {
      // 한 스텝만 진행 — 수렴 후에도 미소 운동 발화 가능.
      if (diverged) continue;
      await stepOnce();
      continue;
    }

    if (ev.type === 'play') {
      if (diverged) continue;
      // 수렴 상태에서 다시 play 누르면 학습률이 발산 구간이거나 lr 변경 시 새 운동.
      // 단순화 — converged 도 다시 자동 진행 (미소 운동만 발생).
      converged = false;
      const next = await autoRun();
      if (next) interrupted = next;
      continue;
    }
  }
}
