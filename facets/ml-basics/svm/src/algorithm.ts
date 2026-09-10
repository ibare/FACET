/**
 * 선형 SVM (소프트 마진) — 힌지 손실 + 준경사하강.
 *
 * 물음: 가장 넓은 틈으로 가르려는데 그 틈 안에 점이 들어와 버리면 어떻게 하는가.
 *
 * 조각 셋이 각각 말한 것 — 띠가 벌어지다 점에 닿아 멈춘다(widestMargin), 경계에
 * 닿은 것만 선을 정한다(supportVectorsOnly), 못 가르면 차원을 올린다(kernelLifts) —
 * 은 모두 **완벽히 갈리는** 자료를 쓴다. 여기서는 갈리지 않을 때 무슨 일이
 * 일어나는지를 본다. 답은 차원을 올리는 것이 아니라 **얼마나 틀려도 되는지를
 * 값으로 정하는 것**이고, 그 값이 C 다.
 *
 * ── 진행 모델
 *
 * ReactiveMechanism. mount 직후 한 벌을 짚어 가며 보인다 — 4000 걸음을 열대여섯
 * 자리에서 짚고, **처음 걸음과 마지막 걸음** 은 점 하나하나를 훑는다. 그 뒤로는
 * `ctx.waitForInput()` 으로 손잡이를 기다린다. 손잡이가 움직이면 **처음부터
 * 다시 재생하지 않고** 그 값으로 다시 훈련한 결과만 갈아 끼운다 — 그래야 C
 * 셋을 견줄 수 있다.
 *
 * 재생·멈춤·한 걸음은 메커니즘이 진다. 알고리즘은 `ctx.sleep` 의 경계에서
 * 끊기고 이어질 뿐이며 위젯 입력만 본다.
 *
 * ── 식별자 (원칙 4)
 *
 * `point:<i>` — 점 하나. 이 facet 이 가리키는 것은 점뿐이다.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type               | silent | payload                                                                   |
 * | ------------------ | ------ | ------------------------------------------------------------------------- |
 * | `phase`            | yes    | `{ phase: string }`                                                        |
 * | `knob-moved`       | no     | `{ c: number; cIndex: number; overlap: boolean; textKey: string }`         |
 * | `train-step`       | no     | `{ step, w0, w1, b, marginWidth, violators: number[], misplaced: number[] }` |
 * | `point-scanned`    | no     | `{ margin: number; violated: boolean }`, target `point:<i>`                |
 * | `done`             | no     | `{ step, c, cIndex, overlap, w0, w1, b, marginWidth, violators, misplaced, textKey }` |
 *
 * `point-scanned` 은 어느 점인지를 **`target` 으로만** 말한다 (`point:<i>`).
 * projector 가 `parseTarget` 으로 읽는다 — 식별자를 payload 에 겹쳐 두면 어느
 * 쪽이 정본인지 갈린다 (원칙 4).
 *
 * ── phase 어휘 (C3 — `irs.ts` 와 글자까지 같아야 한다)
 *
 * `'step-begin' | 'regularize' | 'scan-point' | 'margin' | 'hinge' |
 *  'violated' | 'accumulate' | 'update'`
 *
 * ── 메트릭 (C5)
 *
 * `step-count` · `margin-width` · `violation-count`
 *
 * ── 위젯 입력 어휘
 *
 * `set-c` (segmented-slider, payload `{ value, segmentIndex }`) ·
 * `toggle-overlap` (button). 그 밖의 신호는 흘린다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 이름표 있는 점. `label` 은 −1 또는 +1 이고 힌지 손실이 그 부호를 쓴다. */
export type SvmPoint = { x: number; y: number; label: number };

export type SvmTimings = {
  /** 짚어 보이는 자리 사이의 간격. */
  frameMs: number;
  /** 짚어 보이는 걸음에서 점 하나를 보는 시간. */
  traceMs: number;
};

export type SvmData = {
  type: string;
  points: SvmPoint[];
  /** 겹침 토글이 옮기는 점의 자리. */
  overlapIndex: number;
  /** 그 점이 옮겨 가는 좌표 — 반대 무리 한복판이다. */
  overlapAt: { x: number; y: number };
  /** C 후보. 기본은 `initialCIndex` 번째. */
  cValues: number[];
  initialCIndex: number;
  learningRate: number;
  totalSteps: number;
  /**
   * 4000 걸음 중 짚어 보일 자리. 걸음 0 과 1 은 여는 장면이 맡으므로 2 에서
   * 시작하고, 마지막 하나는 `totalSteps - 1` 이어야 한다 (남은 한 걸음을
   * 짚어 가며 걷는다).
   */
  checkpoints: number[];
  timings: SvmTimings;
};

export type SvmInputEvent = ReactiveInputEvent;

/** 화면에 뜨는 수를 셋째 자리에서 끊는다. 메트릭 배지가 그대로 찍는 값이다. */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * 준경사하강 한 걸음. `irs.ts` 의 `svm_step` 을 줄 단위로 옮긴 것이라
 * **연산 순서까지 같다** — 괄호를 바꾸면 인터프리터와 답이 갈린다.
 *
 * `w` 와 `g` 는 제자리에서 갱신되고 `b` 만 돌려준다. 훑으며 잰 여백은
 * 화면이 쓰므로 함께 돌려준다.
 */
function subgradientStep(
  pts: SvmPoint[],
  w: number[],
  g: number[],
  b: number,
  c: number,
  lr: number,
): { b: number; margins: number[] } {
  const n = pts.length;
  g[0] = w[0];
  g[1] = w[1];
  let gb = 0;
  const margins: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = p.label * (w[0] * p.x + w[1] * p.y + b);
    margins.push(m);
    if (m < 1) {
      g[0] = g[0] + c * (-p.label * p.x);
      g[1] = g[1] + c * (-p.label * p.y);
      gb = gb + c * -p.label;
    }
  }
  w[0] = w[0] - (lr * g[0]) / n;
  w[1] = w[1] - (lr * g[1]) / n;
  return { b: b - (lr * gb) / n, margins };
}

/** 지금 선에서 각 점이 어디에 서 있는가. */
function survey(
  pts: SvmPoint[],
  w0: number,
  w1: number,
  b: number,
): { violators: number[]; misplaced: number[]; marginWidth: number } {
  const violators: number[] = [];
  const misplaced: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const m = p.label * (w0 * p.x + w1 * p.y + b);
    if (m < 1) violators.push(i);
    if (m < 0) misplaced.push(i);
  }
  const norm = Math.hypot(w0, w1);
  return { violators, misplaced, marginWidth: norm > 0 ? 2 / norm : 0 };
}

type Outcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'input'; event: SvmInputEvent };

export const svm = async (ctx: FacetContext<SvmData>): Promise<void> => {
  const rc = ctx as ReactiveContext<SvmData>;
  const d = ctx.data;
  const lr = d.learningRate;
  const cValues = d.cValues.length > 0 ? d.cValues : [1];

  let cIndex = Math.min(Math.max(d.initialCIndex, 0), cValues.length - 1);
  let overlap = false;

  /**
   * 메트릭 배지에 **정확히 이 값**이 찍히게 한다.
   *
   * 메커니즘은 `prev + delta` 로 쌓으므로 실수 메트릭에 차분만 보내면
   * `3.8260000000000005` 같은 것이 배지에 뜬다. 먼저 지금 값을 그대로 빼서
   * 누적기를 정확히 0 으로 돌리고(`x + (-x)` 는 언제나 0), 그 다음 원하는 값을
   * 더한다(`0 + v` 는 언제나 v).
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, -(shown[name] ?? 0));
    ctx.metric(name, value);
    shown[name] = value;
  };

  /** C3 — 호출부가 전부 `phase('margin')` 꼴이라 이름이 grep 으로 잡힌다. */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 겹침을 켜면 한 점이 반대 무리 한복판으로 옮겨 간다. */
  const pointsNow = (): SvmPoint[] =>
    d.points.map((p, i) =>
      overlap && i === d.overlapIndex
        ? { x: d.overlapAt.x, y: d.overlapAt.y, label: p.label }
        : { x: p.x, y: p.y, label: p.label },
    );

  const report = async (pts: SvmPoint[], w: number[], b: number, step: number): Promise<void> => {
    const s = survey(pts, w[0], w[1], b);
    setMetric('step-count', step);
    setMetric('margin-width', round3(s.marginWidth));
    setMetric('violation-count', s.violators.length);
    await ctx.emit({
      type: 'train-step',
      payload: {
        step,
        w0: w[0],
        w1: w[1],
        b,
        marginWidth: s.marginWidth,
        violators: s.violators,
        misplaced: s.misplaced,
      },
    });
  };

  /**
   * 한 걸음의 안쪽을 점 하나하나로 짚는다. 처음 걸음과 마지막 걸음, 둘만
   * 이렇게 간다.
   *
   * 여백을 이미 지킨 점에서는 `accumulate` 가 아예 일어나지 않는다 — 곧 그
   * 점이 선을 조금도 밀지 않는다. 이것이 이 facet 이 코드 패널을 다는 까닭인데,
   * **한 장면만으로는 보이지 않는다.** 걸음 1 에서는 `w = 0` 이라 열 점이 모두
   * 밀고, 수렴한 뒤에는 띠 안에 남은 몇만 민다 (C = 1 처럼 깨끗이 갈리면 아무도
   * 밀지 않는다). 둘을 견주어야 그 조건문이 무엇을 가르는지가 드러난다.
   */
  const traceStep = async (
    pts: SvmPoint[],
    w: number[],
    g: number[],
    b: number,
    c: number,
    pace: boolean,
  ): Promise<number | null> => {
    await phase('step-begin');
    await phase('regularize');
    const stepped = subgradientStep(pts, w, g, b, c, lr);
    for (let i = 0; i < stepped.margins.length; i++) {
      // 한 걸음 안에서 열 점을 다 훑는 것이 이 걸음의 뜻이라 점마다 문을 둘 수
      // 없다. 그래서 바디가 스스로 취소를 진다 (C8).
      if (ctx.cancelled) return null;
      const m = stepped.margins[i];
      await phase('scan-point');
      await phase('margin');
      await ctx.emit({
        type: 'point-scanned',
        target: `point:${i}`,
        payload: { margin: m, violated: m < 1 },
      });
      await phase('hinge');
      await phase('violated');
      if (m < 1) await phase('accumulate');
      if (pace && !(await rc.sleep(d.timings.traceMs))) return null;
    }
    await phase('update');
    return stepped.b;
  };

  const runTraining = async (pts: SvmPoint[], c: number, pace: boolean): Promise<Outcome> => {
    const w = [0, 0];
    // `zeros` 를 쓰지 않는 IR 과 같은 사정 — 준기울기를 담을 자리는 밖에서 만든다.
    const g = [0, 0];
    let b = 0;
    let step = 0;

    if (pace) {
      // 걸음 0 — 아직 선이 없고 **열 점이 모두** 여백을 못 지킨다. 첫 걸음을
      // 짚어 보이면 열 번의 `accumulate` 가 그대로 보인다.
      await report(pts, w, b, 0);
      const opening = await traceStep(pts, w, g, b, c, pace);
      if (opening === null) return { kind: 'cancelled' };
      b = opening;
      step = 1;
      await report(pts, w, b, step);
      if (ctx.cancelled) return { kind: 'cancelled' };
      const early = rc.pollInput<SvmInputEvent>();
      if (early !== null) return { kind: 'input', event: early };
      if (!(await rc.sleep(d.timings.frameMs))) return { kind: 'cancelled' };
    }

    // 짚어 보이는 것은 처음 한 벌뿐이다. 손잡이를 옮긴 뒤로는 갈아 끼운 결과만
    // 보이므로 마지막 자리까지 그냥 셈한다.
    const marks = pace ? d.checkpoints : d.checkpoints.slice(-1);
    for (const target of marks) {
      if (ctx.cancelled) return { kind: 'cancelled' };
      while (step < target) {
        // 짚는 자리 사이는 순수한 셈이라 문을 둘 수 없다 — `await` 가 없으니
        // 도는 동안 `cancelled` 가 바뀔 길도 없다. 그래도 바디가 스스로
        // 검사를 진다 (C8).
        if (ctx.cancelled) return { kind: 'cancelled' };
        b = subgradientStep(pts, w, g, b, c, lr).b;
        step++;
      }
      await report(pts, w, b, step);
      if (!pace) continue;
      const interrupt = rc.pollInput<SvmInputEvent>();
      if (interrupt !== null) return { kind: 'input', event: interrupt };
      if (!(await rc.sleep(d.timings.frameMs))) return { kind: 'cancelled' };
    }

    const traced = await traceStep(pts, w, g, b, c, pace);
    if (traced === null) return { kind: 'cancelled' };
    b = traced;
    step++;
    await report(pts, w, b, step);

    const s = survey(pts, w[0], w[1], b);
    await ctx.emit({
      type: 'done',
      payload: {
        step,
        c,
        cIndex,
        overlap,
        w0: w[0],
        w1: w[1],
        b,
        marginWidth: s.marginWidth,
        violators: s.violators,
        misplaced: s.misplaced,
        textKey:
          s.misplaced.length > 0
            ? 'caption.wrong'
            : s.violators.length > 0
              ? 'caption.inside'
              : 'caption.clean',
      },
    });
    return { kind: 'done' };
  };

  /** 아는 손잡이면 상태를 갈아 끼우고 true. 모르는 신호는 흘린다. */
  const applyInput = async (ev: SvmInputEvent): Promise<boolean> => {
    if (ev.type === 'set-c') {
      const p = ev.payload as { segmentIndex?: unknown; value?: unknown } | undefined;
      let next = cIndex;
      if (typeof p?.segmentIndex === 'number' && p.segmentIndex >= 0 && p.segmentIndex < cValues.length) {
        next = p.segmentIndex;
      } else if (typeof p?.value === 'number') {
        const found = cValues.indexOf(p.value);
        if (found >= 0) next = found;
      }
      if (next === cIndex) return false;
      cIndex = next;
      await ctx.emit({
        type: 'knob-moved',
        payload: { c: cValues[cIndex], cIndex, overlap, textKey: 'caption.cChanged' },
      });
      return true;
    }
    if (ev.type === 'toggle-overlap') {
      overlap = !overlap;
      await ctx.emit({
        type: 'knob-moved',
        payload: {
          c: cValues[cIndex],
          cIndex,
          overlap,
          textKey: overlap ? 'caption.overlapOn' : 'caption.overlapOff',
        },
      });
      return true;
    }
    return false;
  };

  let pending: SvmInputEvent | null = null;
  let pace = true;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const outcome = await runTraining(pointsNow(), cValues[cIndex], pace);
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'input') pending = outcome.event;

      // 손잡이 하나를 받을 때까지 기다린다. 되감기는 메커니즘이 이 promise 를 푼다.
      for (;;) {
        if (pending !== null) {
          const ev = pending;
          pending = null;
          if (await applyInput(ev)) break;
        }
        if (ctx.cancelled) return;
        pending = await rc.waitForInput<SvmInputEvent>();
      }
      // 견주려면 처음으로 돌아가면 안 된다 — 그 값으로 다시 훈련한 결과만 갈아 끼운다.
      pace = false;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
