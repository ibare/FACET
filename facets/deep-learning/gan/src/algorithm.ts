/**
 * gan — 두 봉우리의 진짜 앞에서 만드는 쪽이 어느 봉우리로 몰리는지는 출발 자리가 정한다.
 *
 * 모형 (1 차원)
 *   만드는 쪽   G(z) = a·z + b · 잡음 z 넷은 데이터에 적힌 목록 그대로 (무작위 없음)
 *   가려내는 쪽 D(x) = sigmoid(s(x)) · s(x) = c + Σ_k v_k·φ_k(x) · φ_k(x) = exp(−(x − m_k)² / 2)
 *   sigmoid(z) = 1 / (1 + exp(−z))  — IR 과 같은 식
 *
 * 라운드 하나 = 가려내는 쪽 한 번 → 만드는 쪽 한 번 (둘 다 전체 표본으로 한 번씩).
 *   가려내는 쪽 (경사 상승): grad 넷을 0 으로 → 진짜 차례대로 grad_k += (1 − D)·φ_k / 진짜 수 ·
 *     grad_3 += (1 − D) / 진짜 수 → 가짜(x = a·z + b) 차례대로 grad_k −= D·φ_k / 가짜 수 ·
 *     grad_3 −= D / 가짜 수 → dpar_j += lrD·grad_j   (dpar = [v0, v1, v2, c])
 *   만드는 쪽 (**방금 갱신된** D 로, 포화하지 않는 꼴 평균 log D(G(z))):
 *     s′(x) = Σ_k v_k·φ_k(x)·(−(x − m_k)) · ∂a = 평균 (1 − D)·s′·z · ∂b = 평균 (1 − D)·s′ ·
 *     a += lrG·∂a · b += lrG·∂b
 *   이 차례는 irs.ts 의 `discriminatorStep` · `generatorStep` 과 같다.
 *
 * 판 하나 — 손잡이 값(처음 b)을 받으면 처음 무게에서 라운드 전부를 먼저 셈한다(마운트 즉시 끝난다).
 * 보일 걸음은 걸음 0 과 `showEvery` 번째 라운드마다 두 걸음(가려냄 · 만듦)이다. 보이지 않는 라운드도
 * 셈은 하고, 걸음 경계 없이 지나간다 — 그 라운드의 만듦은 다음 가려냄 걸음 안에서 먼저 운동하고
 * (가짜 · a · b), 그다음 D 곡선이 바뀐다 (payload `skipped` 가 그 라운드 번호들).
 * 걸음 0 은 `startMs` 만큼 머문다 (첫 마운트에는 운동이 없다).
 *
 * 판정 (알고리즘이 셈해 싣는다 — 무대는 다시 셈하지 않는다)
 *   쪽       x < 0 이면 왼쪽. 0 에 놓인 가짜는 쪽이 없으므로 던진다 (이 데이터에서는 걸리지 않는다)
 *   퍼짐     가짜 가운데 가장 큰 것 − 가장 작은 것
 *   higher   D(m_0) · D(m_2) 를 표시 자리(둘째 자리)의 정수로 견준다. 같으면 'none'
 *            (동률: b 0 의 모든 걸음 · 모든 b 의 걸음 0 에서 걸린다 — 대칭이거나 D 가 평평하다)
 *   oneSide  가짜 넷이 모두 한쪽이면 그쪽, 아니면 'none'
 *
 * 이벤트 (payload 는 모두 아래 GanFrame 모양 + 붙은 필드)
 *   gan-init            silent — 판 머리. 걸음 0 을 갈아 끼운다.
 *                       GanFrame + { real: number[]; centers: number[]; xRange: [number, number];
 *                                    start: number; rounds: number; showEvery: number }
 *   discriminator-step  라운드 r 가려냄 뒤. GanFrame + { skipped: number[] }
 *   generator-step      라운드 r 만듦 뒤.   GanFrame + { final: boolean; oneSide: 'left' | 'right' | 'none' }
 *   phase               silent — { phase: 'd-step' | 'g-step' }
 *
 *   GanFrame = { round: number; a: number; b: number; fakes: number[4]; left: number; right: number;
 *                spread: number; mean: number; dpar: number[4]; dLeft: number; dRight: number;
 *                higher: 'left' | 'right' | 'none'; curve: number[curveSamples] }
 *
 * phase 어휘  d-step (가려냄 걸음 · v · c 를 고치는 줄) · g-step (만듦 걸음 · a · b 를 고치는 줄).
 *             걸음 0 에는 phase 가 없다 (projector 가 gan-init 에서 코드 패널을 끈다).
 *
 * 계기        fakes-left · fakes-right — 쪽별 가짜 수. 걸음 0 과 보이는 만듦 걸음마다 지금 값을 들고
 *             차이만 보낸다 (처음 한 번은 차이가 0 이어도 보낸다). 판 머리에서 걸음 0 의 값으로 되돌린다.
 *
 * 입력        { type: 'start', payload: { value: number } } — value 는 startLadder 에 든 수여야 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GanData = {
  type: 'gan';
  stepMs: number;
  startMs: number;
  real: number[];
  noise: number[];
  centers: number[];
  a0: number;
  v0: number[];
  c0: number;
  lrD: number;
  lrG: number;
  rounds: number;
  showEvery: number;
  startLadder: number[];
  start: number;
  xRange: [number, number];
  curveSamples: number;
};

export type GanSide = 'left' | 'right' | 'none';

export type GanSnapshot = {
  round: number;
  kind: 'init' | 'd' | 'g';
  a: number;
  b: number;
  fakes: number[];
  left: number;
  right: number;
  spread: number;
  mean: number;
  dpar: number[];
  dLeft: number;
  dRight: number;
  higher: GanSide;
  curve: number[];
};

// ── 좁히개 ─────────────────────────────────────────────────────────────────

function finiteNumber(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`gan: ${name} 가 유한한 수가 아니다`);
  return v;
}

function numberList(v: unknown, name: string, length?: number): number[] {
  if (!Array.isArray(v)) throw new Error(`gan: ${name} 가 배열이 아니다`);
  const out = v.map((x, i) => finiteNumber(x, `${name}[${i}]`));
  if (length !== undefined && out.length !== length) throw new Error(`gan: ${name} 의 길이가 ${length} 가 아니다`);
  if (out.length === 0) throw new Error(`gan: ${name} 가 비었다`);
  return out;
}

function positiveInt(v: unknown, name: string): number {
  const n = finiteNumber(v, name);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`gan: ${name} 가 양의 정수가 아니다`);
  return n;
}

export function narrowGanData(raw: unknown): GanData {
  if (typeof raw !== 'object' || raw === null) throw new Error('gan: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'gan') throw new Error('gan: data.type 이 gan 이 아니다');
  const centers = numberList(d.centers, 'centers', 3);
  const xr = numberList(d.xRange, 'xRange', 2);
  if (!(xr[0] < xr[1])) throw new Error('gan: xRange 가 거꾸로다');
  const rounds = positiveInt(d.rounds, 'rounds');
  const showEvery = positiveInt(d.showEvery, 'showEvery');
  if (rounds % showEvery !== 0) throw new Error('gan: rounds 가 showEvery 로 나누어떨어지지 않는다 — 끝 라운드가 보이지 않는다');
  const curveSamples = positiveInt(d.curveSamples, 'curveSamples');
  if (curveSamples < 2) throw new Error('gan: curveSamples 는 2 이상이어야 한다');
  const startLadder = numberList(d.startLadder, 'startLadder');
  const start = finiteNumber(d.start, 'start');
  if (!startLadder.includes(start)) throw new Error('gan: start 가 startLadder 에 없다');
  return {
    type: 'gan',
    stepMs: positiveInt(d.stepMs, 'stepMs'),
    startMs: positiveInt(d.startMs, 'startMs'),
    real: numberList(d.real, 'real'),
    noise: numberList(d.noise, 'noise'),
    centers,
    a0: finiteNumber(d.a0, 'a0'),
    v0: numberList(d.v0, 'v0', 3),
    c0: finiteNumber(d.c0, 'c0'),
    lrD: finiteNumber(d.lrD, 'lrD'),
    lrG: finiteNumber(d.lrG, 'lrG'),
    rounds,
    showEvery,
    startLadder,
    start,
    xRange: [xr[0], xr[1]],
    curveSamples,
  };
}

// ── 셈 (IR 과 같은 차례) ──────────────────────────────────────────────────

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** s(x) = c + Σ_k v_k·exp(−(x − m_k)²/2) — k = 0, 1, 2 차례. */
export function score(x: number, dpar: number[], m: number[]): number {
  let s = dpar[3];
  for (let k = 0; k < 3; k++) {
    s = s + dpar[k] * Math.exp((-(x - m[k]) * (x - m[k])) / 2);
  }
  return s;
}

/** 가려내는 쪽 한 번. dpar · grad 를 제자리에서 고친다. */
export function discriminatorStep(
  real: number[],
  noise: number[],
  m: number[],
  dpar: number[],
  gpar: number[],
  grad: number[],
  lrD: number,
): void {
  const a = gpar[0];
  const b = gpar[1];
  for (let j = 0; j < 4; j++) grad[j] = 0;
  const nr = real.length;
  const nf = noise.length;
  for (let i = 0; i < real.length; i++) {
    const x = real[i];
    const d = sigmoid(score(x, dpar, m));
    for (let k = 0; k < 3; k++) {
      grad[k] = grad[k] + ((1 - d) * Math.exp((-(x - m[k]) * (x - m[k])) / 2)) / nr;
    }
    grad[3] = grad[3] + (1 - d) / nr;
  }
  for (let i = 0; i < noise.length; i++) {
    const x = a * noise[i] + b;
    const d = sigmoid(score(x, dpar, m));
    for (let k = 0; k < 3; k++) {
      grad[k] = grad[k] - (d * Math.exp((-(x - m[k]) * (x - m[k])) / 2)) / nf;
    }
    grad[3] = grad[3] - d / nf;
  }
  for (let j = 0; j < 4; j++) dpar[j] = dpar[j] + lrD * grad[j];
}

/** 만드는 쪽 한 번 (방금 갱신된 dpar 로). gpar 를 제자리에서 고친다. */
export function generatorStep(noise: number[], m: number[], dpar: number[], gpar: number[], lrG: number): void {
  const a = gpar[0];
  const b = gpar[1];
  const nf = noise.length;
  let ga = 0;
  let gb = 0;
  for (let i = 0; i < noise.length; i++) {
    const z = noise[i];
    const x = a * z + b;
    const d = sigmoid(score(x, dpar, m));
    let sp = 0;
    for (let k = 0; k < 3; k++) {
      sp = sp + dpar[k] * Math.exp((-(x - m[k]) * (x - m[k])) / 2) * -(x - m[k]);
    }
    ga = ga + ((1 - d) * sp * z) / nf;
    gb = gb + ((1 - d) * sp) / nf;
  }
  gpar[0] = a + lrG * ga;
  gpar[1] = b + lrG * gb;
}

/** 둘째 자리 표시의 정수 — JS toFixed 규칙. 실수 동률을 믿지 않으려고 이 정수로 견준다. */
function hundredths(x: number): number {
  return Number((x * 100).toFixed(0));
}

function snapshot(data: GanData, round: number, kind: GanSnapshot['kind'], dpar: number[], gpar: number[]): GanSnapshot {
  const m = data.centers;
  const fakes = data.noise.map((z) => gpar[0] * z + gpar[1]);
  let left = 0;
  for (const x of fakes) {
    if (x === 0) throw new Error('gan: 0 에 놓인 가짜 — 쪽을 정할 수 없다');
    if (x < 0) left++;
  }
  let lo = fakes[0];
  let hi = fakes[0];
  let sum = 0;
  for (const x of fakes) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
    sum = sum + x;
  }
  const [x0, x1] = data.xRange;
  const n = data.curveSamples;
  const curve: number[] = [];
  for (let i = 0; i < n; i++) curve.push(sigmoid(score(x0 + (i * (x1 - x0)) / (n - 1), dpar, m)));
  const dLeft = sigmoid(score(m[0], dpar, m));
  const dRight = sigmoid(score(m[2], dpar, m));
  const hl = hundredths(dLeft);
  const hr = hundredths(dRight);
  return {
    round,
    kind,
    a: gpar[0],
    b: gpar[1],
    fakes,
    left,
    right: fakes.length - left,
    spread: hi - lo,
    mean: sum / fakes.length,
    dpar: dpar.slice(),
    dLeft,
    dRight,
    higher: hl > hr ? 'left' : hr > hl ? 'right' : 'none',
    curve,
  };
}

/** 한 판 전부 — 걸음 0 과 라운드마다 가려냄 · 만듦 뒤의 모습 (보이지 않는 라운드 포함). */
export function trainGan(data: GanData, b0: number): GanSnapshot[] {
  const m = data.centers;
  const dpar = [data.v0[0], data.v0[1], data.v0[2], data.c0];
  const gpar = [data.a0, b0];
  const grad = [0, 0, 0, 0];
  const out: GanSnapshot[] = [snapshot(data, 0, 'init', dpar, gpar)];
  for (let r = 1; r <= data.rounds; r++) {
    discriminatorStep(data.real, data.noise, m, dpar, gpar, grad, data.lrD);
    out.push(snapshot(data, r, 'd', dpar, gpar));
    generatorStep(data.noise, m, dpar, gpar, data.lrG);
    out.push(snapshot(data, r, 'g', dpar, gpar));
  }
  return out;
}

function frame(s: GanSnapshot) {
  return {
    round: s.round,
    a: s.a,
    b: s.b,
    fakes: s.fakes,
    left: s.left,
    right: s.right,
    spread: s.spread,
    mean: s.mean,
    dpar: s.dpar,
    dLeft: s.dLeft,
    dRight: s.dRight,
    higher: s.higher,
    curve: s.curve,
  };
}

// ── 재생 ──────────────────────────────────────────────────────────────────

export async function ganAlgorithm(ctx: FacetContext<GanData>): Promise<void> {
  const rctx = ctx as ReactiveContext<GanData>;
  const data = narrowGanData(ctx.data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shownMetric = new Map<string, number>([
    ['fakes-left', 0],
    ['fakes-right', 0],
  ]);
  const setMetric = (name: string, value: number) => {
    const cur = shownMetric.get(name);
    if (cur === undefined) throw new Error(`gan: 선언하지 않은 계기 ${name}`);
    ctx.metric(name, value - cur);
    shownMetric.set(name, value);
  };

  /** 한 판을 끝까지 재생한다. 취소되면 false. */
  const play = async (b0: number): Promise<boolean> => {
    const all = trainGan(data, b0);
    const first = all[0];
    await ctx.emit({
      type: 'gan-init',
      payload: {
        ...frame(first),
        real: data.real,
        centers: data.centers,
        xRange: data.xRange,
        start: b0,
        rounds: data.rounds,
        showEvery: data.showEvery,
      },
      silent: true,
    });
    setMetric('fakes-left', first.left);
    setMetric('fakes-right', first.right);
    // 걸음 0 은 첫 마운트에서 운동이 없으므로 따로 머문다 (startMs)
    if (!(await rctx.sleep(data.startMs))) return false;

    let skipped: number[] = [];
    for (let i = 1; i < all.length; i++) {
      if (ctx.cancelled) return false;
      const s = all[i];
      if (s.round % data.showEvery !== 0) {
        if (s.kind === 'g') skipped.push(s.round);
        continue;
      }
      if (s.kind === 'd') {
        await phase('d-step');
        await ctx.emit({ type: 'discriminator-step', payload: { ...frame(s), skipped } });
        skipped = [];
      } else {
        const oneSide: GanSide = s.left === s.fakes.length ? 'left' : s.right === s.fakes.length ? 'right' : 'none';
        await phase('g-step');
        await ctx.emit({
          type: 'generator-step',
          payload: { ...frame(s), final: s.round === data.rounds, oneSide },
        });
        setMetric('fakes-left', s.left);
        setMetric('fakes-right', s.right);
      }
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    let b0 = data.start;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play(b0))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'start') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error('gan: start 입력에 payload 가 없다');
        const value = (p as Record<string, unknown>).value;
        if (typeof value !== 'number' || !data.startLadder.includes(value)) {
          throw new Error(`gan: start 값 ${String(value)} 가 사다리에 없다`);
        }
        b0 = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
