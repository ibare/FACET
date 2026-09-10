/**
 * t-SNE — 비선형으로 편 그림에서 무엇을 읽어도 되고 무엇을 읽으면 안 되는가.
 *
 * ── 진행 모델
 *
 * `ReactiveMechanism`. 마운트 직후 기본 퍼플렉시티로 한 호흡 펴 보이고,
 * 그 뒤로는 `waitForInput` 으로 퍼플렉시티 손잡이만 기다린다. 재생 · 멈춤 ·
 * 한 걸음은 메커니즘이 `ctx.sleep` 의 경계에서 지므로 알고리즘이 알 필요가 없다.
 *
 * ── 이벤트 어휘 (C2)
 *
 *   'source-measured'  원래 자리를 잰 값. 한 번만.               silent: false
 *       payload { gapAB, gapBC, gapAC, ratio, spreads, separation, verdict,
 *                 points, labels }
 *   'run-begin'        새 퍼플렉시티로 펴기 시작한다.            silent: false
 *       payload { perplexity, steps }
 *   'layout-step'      한 프레임치 걸음을 밟은 뒤의 자리.        silent: false
 *       payload { perplexity, step, steps, coords, exaggerating,
 *                 gapAB, gapBC, gapAC, ratio, spreads, separation, verdict }
 *   'run-settled'      걸음을 다 밟았다.                          silent: false
 *       payload { perplexity, step, gapAB, gapBC, gapAC, ratio, spreads,
 *                 separation, verdict }
 *
 * `target` 은 쓰지 않는다 — 이 facet 이 가리키는 것은 낱개 원소가 아니라 판
 * 전체의 배치 하나뿐이라, 식별자를 붙이면 뜻 없는 이름만 늘어난다 (C1).
 *
 * ── 받는 입력 (`mechanism.dispatch` → `ctx.waitForInput` / `ctx.pollInput`)
 *
 *   'perplexity'  퍼플렉시티 손잡이가 움직였다.
 *       payload { value: number }   — 5 · 15 · 30 셋 가운데 하나. 그 밖의 값과
 *                                     그 밖의 type 은 흘린다.
 *
 * 재생 · 멈춤 · 한 걸음 · 되감기는 여기 없다 — 메커니즘이 `ctx.sleep` 의 경계에서
 * 지므로 알고리즘의 입력 어휘에 들어오지 않는다.
 *
 * ── phase 어휘 (C3)
 *
 * **없다.** 이 완제품은 IR 을 두지 않으므로 코드 패널도 없고, phase 를 받을
 * 자리가 어디에도 없다. C3 은 all-or-none 이므로 한쪽만 두지 않는다.
 * 까닭은 `irs.ts` 머리말에 적었다.
 *
 * ── 메트릭 (C5)
 *
 *   'step-count'        지금 판에서 돈 걸음 수 (0 … steps)
 *   'separation-score'  지금 갈림 = 무리 사이 최단 거리 / 무리 안 최대 퍼짐
 *   'gap-ratio'         무리 사이 비 = B–C / A–B
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 알고리즘이 보는 판. `facet.ts::initialData` 가 이 모양으로 선언한다. */
export type TsneData = {
  type: 'tsne';
  /** 원래 자리. 무리 셋 × 스물. */
  points: number[][];
  /** 점마다의 무리 번호 (0 · 1 · 2). */
  labels: number[];
  /** 무리 이름 — 화면의 표식이자 잰 값의 이름 (A · B · C). */
  clusterNames: string[];
  /** 손잡이가 고를 수 있는 퍼플렉시티. */
  perplexities: number[];
  /** 처음 펴 보일 퍼플렉시티. */
  initialPerplexity: number;
  /** 저차원 초기값을 뽑는 씨앗. */
  seed: number;
  /** 하강 걸음 수. */
  steps: number;
  /** 학습률 η. */
  learningRate: number;
  /** 초반 과장 배수. */
  exaggeration: number;
  /** 과장이 걸리는 걸음 수. */
  exaggerationSteps: number;
  /** 초반 관성. */
  momentumLow: number;
  /** 이후 관성. */
  momentumHigh: number;
  /** 관성이 바뀌는 걸음. */
  momentumSwitch: number;
  /** 초기값의 표준편차. */
  initSigma: number;
  /** 한 프레임에 밟는 걸음 수. */
  stepsPerFrame: number;
  /** 프레임 사이 쉼 (ms). */
  frameMs: number;
  /** 이 값 이상이면 "깨끗이 갈렸다" 고 본다. */
  cleanSeparation: number;
  /** 무리 안 퍼짐의 최대 ÷ 최소 가 이 값을 넘으면 "부서졌다" 고 본다. */
  brokenSpreadRatio: number;
};

/** 한 배치를 잰 값. 화면에 뜨는 수는 전부 여기서 나온다. */
export type LayoutMeasure = {
  gapAB: number;
  gapBC: number;
  gapAC: number;
  /** B–C ÷ A–B. 원래 자리에서 2.18 이던 것이 얼마가 되는가. */
  ratio: number;
  /** 무리마다 가운데에서의 제곱평균 거리. */
  spreads: number[];
  /** 무리 사이 최단 거리 ÷ 무리 안 최대 퍼짐. */
  separation: number;
  verdict: 'broken' | 'clean' | 'blurred';
};

/** 손잡이가 보내는 입력. control-bar 의 segmented-slider 가 이 모양으로 온다. */
export type TsneInputEvent = ReactiveInputEvent & {
  payload?: { value?: unknown; segmentIndex?: unknown };
};

const TWO_PI = Math.PI * 2;

/**
 * mulberry32. 씨앗 하나로 같은 수열을 되풀이한다.
 *
 * 점을 놓는 지터와 저차원 초기값이 같은 발생기를 쓴다 — 씨앗만 다르다.
 */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box–Muller. 한 쌍에서 둘이 나오므로 남는 하나를 들고 있다가 다음에 준다.
 *
 * 들고 있지 않고 매번 새 쌍을 뽑아 cos 만 쓰면 같은 씨앗에서 다른 수열이 나온다.
 * 어느 쪽도 틀리지 않으나 결과의 자리가 달라지므로 한쪽으로 못박아 둔다.
 */
function makeGaussian(seed: number): () => number {
  const rand = mulberry32(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const kept = spare;
      spare = null;
      return kept;
    }
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const mag = Math.sqrt(-2 * Math.log(u1));
    spare = mag * Math.sin(TWO_PI * u2);
    return mag * Math.cos(TWO_PI * u2);
  };
}

function squaredDistances(points: number[][]): number[][] {
  const n = points.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) out.push(new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let acc = 0;
      for (let d = 0; d < points[i].length; d += 1) {
        const diff = points[i][d] - points[j][d];
        acc += diff * diff;
      }
      out[i][j] = acc;
      out[j][i] = acc;
    }
  }
  return out;
}

/**
 * 고차원 유사도 P.
 *
 * 조건부 p(j|i) 를 가우시안으로 두고, σ 는 퍼플렉시티에 맞춰 β = 1/(2σ²) 를
 * 이진 탐색해 정한다. 엔트로피가 log(perplexity) 보다 크면 β 를 키운다 —
 * 폭이 넓어 이웃을 너무 많이 세고 있다는 뜻이다.
 *
 * 그 뒤 대칭화해 P[i][j] = (cond[i][j] + cond[j][i]) / (2N) 로 둔다.
 */
export function highDimensionalP(points: number[][], perplexity: number): number[][] {
  const n = points.length;
  const dsq = squaredDistances(points);
  const target = Math.log(perplexity);
  const cond: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    let beta = 1;
    let betamin = -Infinity;
    let betamax = Infinity;
    const row = new Array<number>(n).fill(0);
    for (let tries = 0; tries < 200; tries += 1) {
      let sum = 0;
      for (let j = 0; j < n; j += 1) {
        row[j] = i === j ? 0 : Math.exp(-dsq[i][j] * beta);
        sum += row[j];
      }
      if (sum === 0) sum = 1e-12;
      let weighted = 0;
      for (let j = 0; j < n; j += 1) weighted += dsq[i][j] * row[j];
      const entropy = Math.log(sum) + (beta * weighted) / sum;
      for (let j = 0; j < n; j += 1) row[j] /= sum;
      const diff = entropy - target;
      if (Math.abs(diff) < 1e-5) break;
      if (diff > 0) {
        betamin = beta;
        beta = betamax === Infinity ? beta * 2 : (beta + betamax) / 2;
      } else {
        betamax = beta;
        beta = betamin === -Infinity ? beta / 2 : (beta + betamin) / 2;
      }
    }
    cond.push(row);
  }
  const symmetric: number[][] = [];
  for (let i = 0; i < n; i += 1) symmetric.push(new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      symmetric[i][j] = Math.max((cond[i][j] + cond[j][i]) / (2 * n), 1e-12);
    }
  }
  return symmetric;
}

/** 한 판을 재는 자 — 가운데 사이 거리 · 무리 안 퍼짐 · 그 둘의 몫. */
export function measureLayout(
  coords: number[][],
  labels: number[],
  cleanSeparation: number,
  brokenSpreadRatio: number,
): LayoutMeasure {
  const groups: number[][][] = [[], [], []];
  for (let i = 0; i < coords.length; i += 1) groups[labels[i]].push(coords[i]);
  const centres = groups.map((group) => {
    let cx = 0;
    let cy = 0;
    for (const p of group) {
      cx += p[0];
      cy += p[1];
    }
    return [cx / group.length, cy / group.length];
  });
  const spreads = groups.map((group, k) => {
    let acc = 0;
    for (const p of group) {
      acc += (p[0] - centres[k][0]) ** 2 + (p[1] - centres[k][1]) ** 2;
    }
    return Math.sqrt(acc / group.length);
  });
  const between = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const gapAB = between(centres[0], centres[1]);
  const gapBC = between(centres[1], centres[2]);
  const gapAC = between(centres[0], centres[2]);
  const widest = Math.max(...spreads);
  const tightest = Math.min(...spreads);
  const separation = widest === 0 ? 0 : Math.min(gapAB, gapBC, gapAC) / widest;
  const shattered = tightest > 0 && widest / tightest > brokenSpreadRatio;
  const verdict: LayoutMeasure['verdict'] =
    separation >= cleanSeparation ? 'clean' : shattered ? 'broken' : 'blurred';
  return {
    gapAB,
    gapBC,
    gapAC,
    ratio: gapAB === 0 ? 0 : gapBC / gapAB,
    spreads,
    separation,
    verdict,
  };
}

/** 한 번의 하강. 걸음을 나눠 밟을 수 있게 상태를 들고 있는다. */
export type TsneRun = {
  readonly perplexity: number;
  readonly coords: number[][];
  readonly stepsDone: number;
  /** 걸음을 n 번 밟는다. */
  advance(n: number): void;
};

/**
 * 하강 한 판을 차린다.
 *
 * ★ 기울기는 **전부 모은 뒤 한꺼번에** 얹는다. 루프 안에서 점마다 곧바로
 *   `Y[i] += inc[i]` 를 하면 다음 점의 `(y_i − y_j)` 는 새 좌표를 쓰는데
 *   `num[i][j]` 는 옛 좌표로 미리 셈해 둔 값이라 둘이 어긋나고 연쇄로 터진다.
 */
export function startTsneRun(data: TsneData, perplexity: number): TsneRun {
  const n = data.points.length;
  const dim = 2;
  const probs = highDimensionalP(data.points, perplexity);
  const gaussian = makeGaussian(data.seed);
  const coords: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    coords.push([gaussian() * data.initSigma, gaussian() * data.initSigma]);
  }
  const gains: number[][] = coords.map(() => [1, 1]);
  const inc: number[][] = coords.map(() => [0, 0]);
  const num: number[][] = [];
  for (let i = 0; i < n; i += 1) num.push(new Array<number>(n).fill(0));
  const grad: number[][] = coords.map(() => [0, 0]);
  let stepsDone = 0;

  const oneStep = (): void => {
    const exag = stepsDone < data.exaggerationSteps ? data.exaggeration : 1;
    const momentum = stepsDone < data.momentumSwitch ? data.momentumLow : data.momentumHigh;

    // 저차원 유사도 Q — num[i][j] = 1 / (1 + |y_i − y_j|²), Q = num / ΣΣnum.
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let acc = 0;
        for (let d = 0; d < dim; d += 1) {
          const diff = coords[i][d] - coords[j][d];
          acc += diff * diff;
        }
        const v = 1 / (1 + acc);
        num[i][j] = v;
        num[j][i] = v;
        total += 2 * v;
      }
    }
    if (total === 0) total = 1e-12;

    // 기울기 = 4 · Σ_j (exag·P[i][j] − Q[i][j]) · num[i][j] · (y_i − y_j).
    for (let i = 0; i < n; i += 1) {
      grad[i][0] = 0;
      grad[i][1] = 0;
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const q = Math.max(num[i][j] / total, 1e-12);
        const mul = 4 * (exag * probs[i][j] - q) * num[i][j];
        for (let d = 0; d < dim; d += 1) grad[i][d] += mul * (coords[i][d] - coords[j][d]);
      }
    }

    // 모은 뒤에 한꺼번에 얹는다.
    for (let i = 0; i < n; i += 1) {
      for (let d = 0; d < dim; d += 1) {
        const g = grad[i][d];
        gains[i][d] =
          Math.sign(g) !== Math.sign(inc[i][d]) ? gains[i][d] + 0.2 : gains[i][d] * 0.8;
        if (gains[i][d] < 0.01) gains[i][d] = 0.01;
        inc[i][d] = momentum * inc[i][d] - data.learningRate * gains[i][d] * g;
        coords[i][d] += inc[i][d];
      }
    }

    // 무게중심을 0 으로 옮긴다.
    for (let d = 0; d < dim; d += 1) {
      let mean = 0;
      for (let i = 0; i < n; i += 1) mean += coords[i][d];
      mean /= n;
      for (let i = 0; i < n; i += 1) coords[i][d] -= mean;
    }
    stepsDone += 1;
  };

  return {
    perplexity,
    coords,
    get stepsDone() {
      return stepsDone;
    },
    advance(count: number) {
      for (let k = 0; k < count && stepsDone < data.steps; k += 1) oneStep();
    },
  };
}

/** 한 퍼플렉시티를 끝까지 돌린 결과. 테스트와 알고리즘이 같은 길을 쓴다. */
export function runTsne(
  data: TsneData,
  perplexity: number,
): { coords: number[][]; measure: LayoutMeasure } {
  const run = startTsneRun(data, perplexity);
  run.advance(data.steps);
  return {
    coords: run.coords.map((p) => [p[0], p[1]]),
    measure: measureLayout(run.coords, data.labels, data.cleanSeparation, data.brokenSpreadRatio),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 손잡이가 보낸 퍼플렉시티. 알아볼 수 없으면 null. */
function readPerplexity(input: TsneInputEvent, allowed: number[]): number | null {
  if (input.type !== 'perplexity') return null;
  const raw = input.payload?.value;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  return allowed.includes(value) ? value : null;
}

export const tsne = async (context: FacetContext<TsneData>): Promise<void> => {
  const ctx = context as ReactiveContext<TsneData>;
  const data = ctx.data;

  /**
   * 계기에 절대값을 얹는다.
   *
   * `ctx.metric` 은 더할 값만 받으므로 `목표 − 지금값` 을 한 번에 더하면 끝자리가
   * 어긋난다. 먼저 0 으로 되돌린 뒤 얹으면 그럴 일이 없다 — `x + (−x)` 는 언제나
   * 정확히 0 이고 `0 + v` 는 정확히 v 다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const cur = shown.get(name) ?? 0;
    if (cur !== 0) ctx.metric(name, -cur);
    if (value !== 0) ctx.metric(name, value);
    shown.set(name, value);
  };

  const measure = (coords: number[][]): LayoutMeasure =>
    measureLayout(coords, data.labels, data.cleanSeparation, data.brokenSpreadRatio);

  const publish = (m: LayoutMeasure, step: number): void => {
    setMetric('step-count', step);
    setMetric('separation-score', round2(m.separation));
    setMetric('gap-ratio', round2(m.ratio));
  };

  /** 자동 재생 도중 들어온 손잡이. 마지막 것만 남긴다. */
  const drainPerplexity = (): number | null => {
    let picked: number | null = null;
    for (;;) {
      // 문이 없는 루프다 — 큐를 비우는 동기 셈이라 걸음 사이가 없다 (C8).
      // 취소를 `null` 로 겹치지 않으려고 지금까지 고른 것을 그대로 돌려준다.
      if (ctx.cancelled) return picked;
      const queued = ctx.pollInput<TsneInputEvent>();
      if (queued === null) return picked;
      const value = readPerplexity(queued, data.perplexities);
      if (value !== null) picked = value;
    }
  };

  /**
   * 한 퍼플렉시티로 끝까지 편다.
   *
   * 도중에 손잡이가 움직이면 그 자리에서 접고 새 값을 돌려준다 — 처음부터 다시
   * 재생하는 것이 아니라 그 값으로 다시 셈한 결과로 갈아 끼우기 위함이다.
   * 끝까지 갔거나 취소됐으면 null.
   */
  const play = async (perplexity: number): Promise<number | null> => {
    const run = startTsneRun(data, perplexity);
    await ctx.emit({
      type: 'run-begin',
      payload: { perplexity, steps: data.steps },
    });
    const frame = async (): Promise<LayoutMeasure> => {
      const m = measure(run.coords);
      publish(m, run.stepsDone);
      await ctx.emit({
        type: 'layout-step',
        payload: {
          perplexity,
          step: run.stepsDone,
          steps: data.steps,
          coords: run.coords.map((p) => [p[0], p[1]]),
          exaggerating: run.stepsDone < data.exaggerationSteps,
          gapAB: m.gapAB,
          gapBC: m.gapBC,
          gapAC: m.gapAC,
          ratio: m.ratio,
          spreads: m.spreads,
          separation: m.separation,
          verdict: m.verdict,
        },
      });
      return m;
    };
    await frame();
    while (run.stepsDone < data.steps) {
      // 문(gate)이 바디 첫 줄이다 — sleep 이 취소도 멈춤도 함께 진다 (C8).
      if (!(await ctx.sleep(data.frameMs))) return null;
      const moved = drainPerplexity();
      if (moved !== null && moved !== perplexity) return moved;
      run.advance(data.stepsPerFrame);
      await frame();
    }
    const settled = measure(run.coords);
    await ctx.emit({
      type: 'run-settled',
      payload: {
        perplexity,
        step: run.stepsDone,
        gapAB: settled.gapAB,
        gapBC: settled.gapBC,
        gapAC: settled.gapAC,
        ratio: settled.ratio,
        spreads: settled.spreads,
        separation: settled.separation,
        verdict: settled.verdict,
      },
    });
    return null;
  };

  try {
    const source = measure(data.points);
    await ctx.emit({
      type: 'source-measured',
      payload: {
        points: data.points.map((p) => [p[0], p[1]]),
        labels: [...data.labels],
        gapAB: source.gapAB,
        gapBC: source.gapBC,
        gapAC: source.gapAC,
        ratio: source.ratio,
        spreads: source.spreads,
        separation: source.separation,
        verdict: source.verdict,
      },
    });

    let perplexity = data.initialPerplexity;
    let queued: number | null = perplexity;
    for (;;) {
      if (ctx.cancelled) return;
      if (queued !== null) {
        perplexity = queued;
        queued = await play(perplexity);
        continue;
      }
      const input = await ctx.waitForInput<TsneInputEvent>();
      const value = readPerplexity(input, data.perplexities);
      // 알 수 없는 조작은 흘린다. 재생 · 멈춤 · 한 걸음은 메커니즘이 진다.
      if (value !== null && value !== perplexity) queued = value;
    }
  } catch (err) {
    // reset / destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
