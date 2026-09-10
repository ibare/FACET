/**
 * 로지스틱 회귀 — 확률로 답하는 분류기가 어떻게 배우고 어디서 "이쪽" 이라 말하는가.
 *
 * 진행 모델: ReactiveMechanism. 마운트 직후 스스로 학습을 재생하고, 다 배운
 * 뒤에도 알고리즘은 끝나지 않는다 — **문턱은 학습이 끝난 뒤에도 독자가 고르는
 * 값**이라 그 입력을 계속 기다린다. 대기는 `destroy` / `reset` 이 깨운다
 * (`ReactiveMechanism.flushInputRejector`).
 *
 * ── 셈
 *
 * 배치 경사하강. 무게 둘과 치우침 하나를 0 에서 시작해 학습률 0.2 로 600 걸음.
 * 한 걸음은 `irs.ts` 의 `train_step` 과 같은 셈이다:
 *
 *   z = w0*x + w1*y + b   /   p = 1/(1+exp(-z))   /   g += (p - label) * x
 *   w -= eta * g / n
 *
 * 600 걸음을 다 보이지 않는다. `checkpoints` 가 정한 스무 마디에서만 화면을
 * 갱신한다 — 처음엔 촘촘하고 뒤로 갈수록 성기다. 앞이 빠르고 뒤가 느린 것이
 * 경사하강의 성질이라, 같은 간격으로 짚으면 뒤쪽 열다섯 마디가 같은 그림이 된다.
 *
 * ── 이벤트 (C2)
 *
 *   phase          silent. `{ phase: string }`. 코드 패널 줄 강조.
 *   state-changed  학습이 한 마디 나아갔다. payload 는 아래 `FramePayload`.
 *   mark           독자가 결정 문턱을 옮겼다. payload 는 같은 `FramePayload` —
 *                  무게는 그대로이고 판정과 경계선만 갈린다.
 *   done           600 걸음을 마쳤다. payload 는 같은 `FramePayload`.
 *
 *   FramePayload = {
 *     step: number            지금까지 밟은 걸음 수
 *     w0, w1, bias: number    무게 둘과 치우침
 *     probs: number[]         점마다의 확률. points 와 같은 차례
 *     loss: number            평균 로그손실
 *     threshold: number       지금 결정 문턱
 *     thresholdIndex: number  thresholds 배열에서의 자리
 *     hit, miss, falseAlarm: number   맞힘 / 놓침(1인데 0) / 헛짚음(0인데 1)
 *     finished: boolean       600 걸음을 마쳤는가
 *     textKey: string         캡션 메시지 키. 문안은 facet.ts 의 messages (C10)
 *   }
 *
 * ── 입력 어휘 (mechanism.dispatch → ctx.waitForInput / pollInput)
 *
 *   threshold  segmented-slider. payload `{ value: number }` — 0.3 / 0.5 / 0.8
 *   play / pause / step   control-bar 의 재생 묶음. reset · speed 는 메커니즘이 먹는다
 *
 * ── phase 어휘 (C3 — `irs.ts` 와 글자까지 같다)
 *
 *   'reset-gradient' | 'forward' | 'squash' | 'accumulate' | 'update'
 *
 * ── 메트릭 (C5)
 *
 *   step-count · log-loss · correct-count
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type LogisticPoint = {
  x: number;
  y: number;
  /** 이름표. 0 = 아래쪽 무리, 1 = 위쪽 무리. */
  label: number;
};

export type LogisticRegressionData = {
  type: string;
  points: LogisticPoint[];
  /** 학습률 η. */
  eta: number;
  /** 화면을 갱신할 걸음 번호들. 오름차순이며 마지막이 총 걸음 수다. */
  checkpoints: number[];
  /** 고를 수 있는 결정 문턱. */
  thresholds: number[];
  /** 처음 문턱. facet.ts 의 segmented-slider `default` 와 같아야 한다. */
  thresholdIndex: number;
  timings: {
    /** phase 하나를 짚고 머무는 시간. */
    phaseMs: number;
    /** 한 마디를 보이고 머무는 시간. */
    frameMs: number;
  };
};

/** 확률이 0 이나 1 에 붙어 로그가 발산하는 것을 막는 여유. */
const LOG_EPS = 1e-12;
/** 화면에 띄우는 손실의 자릿수. */
const LOSS_SCALE = 1e4;

type Tally = { hit: number; miss: number; falseAlarm: number };

/** 확률 p 를 문턱 th 로 갈라 이름표와 견준다. */
function tallyAt(points: LogisticPoint[], probs: number[], th: number): Tally {
  let hit = 0;
  let miss = 0;
  let falseAlarm = 0;
  for (let i = 0; i < points.length; i += 1) {
    const said = probs[i] >= th ? 1 : 0;
    if (said === points[i].label) hit += 1;
    else if (points[i].label === 1) miss += 1;
    else falseAlarm += 1;
  }
  return { hit, miss, falseAlarm };
}

export const logisticRegression = async (
  ctx: FacetContext<LogisticRegressionData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<LogisticRegressionData>;
  const data = ctx.data;
  const points = data.points;
  const n = points.length;
  if (n === 0) return;

  const eta = data.eta;
  const checkpoints = data.checkpoints;
  const thresholds = data.thresholds;
  const { phaseMs, frameMs } = data.timings;

  let thresholdIndex = Math.min(Math.max(data.thresholdIndex, 0), thresholds.length - 1);
  let w0 = 0;
  let w1 = 0;
  let bias = 0;
  let step = 0;
  let markIndex = 0;
  let playing = true;
  let pendingStep = false;

  /**
   * 메트릭 미러. 메커니즘은 delta 를 누적하므로 (`ctx.metric` 은 '얼마 더' 다)
   * 절대값을 띄우려면 여기서 같은 셈을 되풀이해 어긋남을 막는다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, target: number): void => {
    const cur = shown.get(name) ?? 0;
    const delta = target - cur;
    if (delta === 0) return;
    ctx.metric(name, delta);
    shown.set(name, cur + delta);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const probsNow = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const z = w0 * points[i].x + w1 * points[i].y + bias;
      out.push(1 / (1 + Math.exp(-z)));
    }
    return out;
  };

  const meanLogLoss = (probs: number[]): number => {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      const p = Math.min(1 - LOG_EPS, Math.max(LOG_EPS, probs[i]));
      s += points[i].label === 1 ? -Math.log(p) : -Math.log(1 - p);
    }
    return s / n;
  };

  /** `irs.ts` 의 `train_step` 과 같은 셈 한 판. */
  const trainStep = (): void => {
    let g0 = 0;
    let g1 = 0;
    let gb = 0;
    for (let i = 0; i < n; i += 1) {
      const pt = points[i];
      const z = w0 * pt.x + w1 * pt.y + bias;
      const p = 1 / (1 + Math.exp(-z));
      const d = p - pt.label;
      g0 += d * pt.x;
      g1 += d * pt.y;
      gb += d;
    }
    w0 -= (eta * g0) / n;
    w1 -= (eta * g1) / n;
    bias -= (eta * gb) / n;
    step += 1;
  };

  const frame = (textKey: string): Record<string, unknown> => {
    const probs = probsNow();
    const loss = meanLogLoss(probs);
    const threshold = thresholds[thresholdIndex];
    const t = tallyAt(points, probs, threshold);
    const finished = markIndex >= checkpoints.length;
    setMetric('step-count', step);
    setMetric('log-loss', Math.round(loss * LOSS_SCALE) / LOSS_SCALE);
    setMetric('correct-count', t.hit);
    return {
      step,
      w0,
      w1,
      bias,
      probs,
      loss,
      threshold,
      thresholdIndex,
      hit: t.hit,
      miss: t.miss,
      falseAlarm: t.falseAlarm,
      finished,
      textKey,
    };
  };

  /** 입력 하나를 먹는다. 문턱이 실제로 옮겨졌으면 true. */
  const applyInput = (e: ReactiveInputEvent): boolean => {
    switch (e.type) {
      case 'threshold': {
        const p = e.payload as { value?: unknown } | undefined;
        if (typeof p?.value !== 'number') return false;
        let nearest = 0;
        for (let i = 1; i < thresholds.length; i += 1) {
          if (Math.abs(thresholds[i] - p.value) < Math.abs(thresholds[nearest] - p.value)) {
            nearest = i;
          }
        }
        if (nearest === thresholdIndex) return false;
        thresholdIndex = nearest;
        return true;
      }
      case 'play':
        playing = true;
        return false;
      case 'pause':
        playing = false;
        return false;
      case 'step':
        playing = false;
        pendingStep = true;
        return false;
      default:
        // 이 facet 이 모르는 어휘. 조용히 버린다.
        return false;
    }
  };

  await ctx.emit({ type: 'state-changed', payload: frame('caption.start') });

  while (!ctx.cancelled) {
    // 밀린 입력을 먼저 먹는다.
    let thresholdMoved = false;
    for (let e = rc.pollInput(); e !== null; e = rc.pollInput()) {
      if (applyInput(e)) thresholdMoved = true;
    }
    if (thresholdMoved) await ctx.emit({ type: 'mark', payload: frame('caption.threshold') });
    if (ctx.cancelled) return;

    const finished = markIndex >= checkpoints.length;
    if (finished || (!playing && !pendingStep)) {
      // 멈춰 있다. 다 배운 뒤에도 문턱은 독자의 것이라 이 기다림은 끝나지 않는다.
      let e: ReactiveInputEvent;
      try {
        e = await rc.waitForInput();
      } catch {
        // destroy / reset 이 대기를 깨웠다. 더 할 일이 없다.
        return;
      }
      if (applyInput(e)) await ctx.emit({ type: 'mark', payload: frame('caption.threshold') });
      continue;
    }

    pendingStep = false;

    // 한 마디 — 코드 패널을 따라 다섯 phase 를 밟는다.
    await phase('reset-gradient');
    if (!(await beat(rc, playing, phaseMs))) return;
    await phase('forward');
    if (!(await beat(rc, playing, phaseMs))) return;
    await phase('squash');
    if (!(await beat(rc, playing, phaseMs))) return;
    await phase('accumulate');
    if (!(await beat(rc, playing, phaseMs))) return;

    const target = checkpoints[markIndex];
    while (step < target && !ctx.cancelled) trainStep();
    markIndex += 1;
    if (ctx.cancelled) return;

    await phase('update');
    if (markIndex >= checkpoints.length) {
      await ctx.emit({ type: 'done', payload: frame('caption.done') });
    } else {
      await ctx.emit({ type: 'state-changed', payload: frame('caption.training') });
    }
    if (!(await beat(rc, playing, frameMs))) return;
  }
};

/**
 * 재생 중일 때만 뜸을 들인다. 한 걸음 단추로 온 마디는 기다릴 까닭이 없다.
 * @returns 이어가도 되면 true, cancel 로 깨어났으면 false.
 */
async function beat(rc: ReactiveContext<LogisticRegressionData>, playing: boolean, ms: number): Promise<boolean> {
  if (!playing) return !rc.cancelled;
  return rc.sleep(ms);
}
