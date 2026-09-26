/**
 * vae — VAE 의 KL 무게 β 를 돌려 잠재 축 위의 퍼짐(μ ± σ)과 되돌린 칸을 본다.
 *
 * 한 판(손잡이 값 하나) = 처음 무게 · 같은 씨앗에서 판 `epochs`(400) 을 모두 셈하고,
 * 판 0 · every · 2·every · … · epochs 의 모습만 걸음으로 보인다 (걸음 아홉, 걸음 0 포함).
 * 손잡이를 돌리면 앞 판의 학습을 잇지 않고 처음부터 다시 배운다 — 같은 β 면 같은 화면.
 *
 * ── 모형 (교과서 VAE, 잠재 하나 · 칸 넷) ──────────────────────────────────
 *   μ = Σ w_k x_k + b_μ · lv = Σ v_k x_k + b_lv · σ = exp(0.5·lv) · z = μ + σ·ε · q_k = sigmoid(W_k·z + d_k)
 *   손실 = Σ_k BCE(x_k, q_k) + β·KL · KL = ½(μ² + exp(lv) − 1 − lv)
 *   무게 열여덟의 차례: w 4 · b_μ · v 4 · b_lv · W 4 · d 4
 *   한 판: 기울기 버퍼를 0 으로 → 입력을 적힌 차례로 (칸 k 0 → 3) 더함 → p_j ← p_j − (lr·g_j) / n
 *   이 차례는 IR `trainEpoch` 과 한 줄씩 같다 (`vaeEpoch`).
 *
 * ── 무작위 (ε) ────────────────────────────────────────────────────────────
 *   Park–Miller 최소 표준: x ← 48271·x mod 2147483647, u = x / 2147483647 (곱의 최대 ≈ 1.04e14 < 2⁵³ 라 정확).
 *   ε = sqrt(−2·log u1) · cos(2π·u2) — Box–Muller 의 코사인 쪽 하나, u1 · u2 를 차례로 뽑는다.
 *   뽑는 차례: 판 1 의 입력 1 · 2 · 3 → 판 2 의 입력 1 · 2 · 3 → …
 *   생성기는 IR 에 두지 않는다 — IR 은 뽑힌 ε 를 목록으로 받는다.
 *
 * ── 보일 값 (뽑기 없이 z = μ) ───────────────────────────────────────────
 *   μ · σ · μ ± σ · 되돌린 칸(z = μ 를 디코더에) · 복원 오차(칸 넷 평균 BCE 의 입력 평균) · KL(입력 평균)
 *   이웃 틈 = μ 차례로 늘어세운 이웃끼리 (오른쪽 μ − σ) − (왼쪽 μ + σ). **셈한 틈이 0 보다 작을 때만 겹침**.
 *   μ 가 같은 두 입력(동률)은 적힌 차례를 지킨다 (안정 정렬) — 이 데이터에서는 걸리지 않는다.
 *
 * ── 이벤트 ────────────────────────────────────────────────────────────────
 *   init      (silent)  VaeSnapshot — 새 판의 걸음 0 (판 0, 처음 무게). 앞 판의 화면을 갈아 끼운다
 *   snapshot            VaeSnapshot — 걸음 1..8 (판 every·k 뒤)
 *   phase     (silent)  { phase: 'encode' | 'kl-pull' }
 *
 *   VaeSnapshot = {
 *     epoch: number, beta: number, zRange: [number, number],
 *     bands: { id: string, mu: number, sigma: number, lo: number, hi: number }[]   (입력 차례)
 *     order: string[]                                   (μ 차례, 왼 → 오른)
 *     gaps: { left: string, right: string, gap: number, overlap: boolean }[]   (이웃 쌍, 왼 → 오른)
 *     overlapCount: number, narrowestGap: number,
 *     cells: { id: string, x: number[], q: number[] }[]  (입력 차례, 칸 넷)
 *     recon: number, kl: number, sigmaMean: number, muWidth: number
 *   }
 *
 * ── phase ─────────────────────────────────────────────────────────────────
 *   encode   걸음 0 — μ · lv · σ 를 셈하는 줄
 *   kl-pull  걸음 1..8 — β 가 닿는 dμ · dlv 두 줄
 *
 * ── 계기 ──────────────────────────────────────────────────────────────────
 *   epoch          지금 판 번호 (걸음 k 에 every·k)
 *   overlap-pairs  겹친 이웃 수
 *   판 머리에서 0 으로 되돌리고, 지금 값을 들고 차이만 보낸다 (처음 한 번은 차이가 0 이어도).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type VaeInput = { id: string; x: number[] };

export type VaeData = {
  type: 'vae';
  stepMs: number;
  inputs: VaeInput[];
  init: number[];
  lr: number;
  epochs: number;
  every: number;
  seed: number;
  betaLadder: number[];
  beta: number;
  zRange: [number, number];
};

export type VaeBand = { id: string; mu: number; sigma: number; lo: number; hi: number };
export type VaeGap = { left: string; right: string; gap: number; overlap: boolean };
export type VaeCells = { id: string; x: number[]; q: number[] };

export type VaeSnapshot = {
  epoch: number;
  beta: number;
  zRange: [number, number];
  bands: VaeBand[];
  order: string[];
  gaps: VaeGap[];
  overlapCount: number;
  narrowestGap: number;
  cells: VaeCells[];
  recon: number;
  kl: number;
  sigmaMean: number;
  muWidth: number;
};

/** 칸 수 — 무게 열여덟(4 + 1 + 4 + 1 + 4 + 4)이 이것에 묶여 있다. */
export const VAE_CELLS = 4;
export const VAE_PARAMS = 18;

const LCG_M = 2147483647;
const LCG_A = 48271;

// ── 좁히개 ────────────────────────────────────────────────────────────────

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every(isNum)) throw new Error(`vae: ${what} 는 수의 목록이어야 한다`);
  return v as number[];
}

/** ctx.data 를 모양대로 좁힌다 — 어긋나면 던진다. */
export function narrowVaeData(raw: unknown): VaeData {
  if (typeof raw !== 'object' || raw === null) throw new Error('vae: data 가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'vae') throw new Error(`vae: data.type 이 'vae' 가 아니다 (${String(d.type)})`);
  if (!isNum(d.stepMs) || d.stepMs <= 0) throw new Error('vae: stepMs 는 양수여야 한다');
  if (!Array.isArray(d.inputs) || d.inputs.length < 2) throw new Error('vae: inputs 는 둘 이상이어야 한다');
  const ids = new Set<string>();
  const inputs: VaeInput[] = d.inputs.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) throw new Error(`vae: inputs[${i}] 가 객체가 아니다`);
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') throw new Error(`vae: inputs[${i}].id 가 없다`);
    if (ids.has(r.id)) throw new Error(`vae: 입력 식별자 ${r.id} 가 겹친다`);
    ids.add(r.id);
    const x = numList(r.x, `inputs[${i}].x`);
    if (x.length !== VAE_CELLS || !x.every((v) => v === 0 || v === 1)) {
      throw new Error(`vae: inputs[${i}].x 는 0 · 1 칸 ${VAE_CELLS} 개여야 한다`);
    }
    return { id: r.id, x: [...x] };
  });
  const init = numList(d.init, 'init');
  if (init.length !== VAE_PARAMS) throw new Error(`vae: init 은 무게 ${VAE_PARAMS} 개여야 한다 (${init.length})`);
  if (!isNum(d.lr) || d.lr <= 0) throw new Error('vae: lr 은 양수여야 한다');
  if (!isNum(d.epochs) || !Number.isInteger(d.epochs) || d.epochs < 1) throw new Error('vae: epochs 는 1 이상 정수');
  if (!isNum(d.every) || !Number.isInteger(d.every) || d.every < 1 || d.epochs % d.every !== 0) {
    throw new Error('vae: every 는 epochs 를 나누는 양의 정수여야 한다');
  }
  if (!isNum(d.seed) || !Number.isInteger(d.seed) || d.seed < 1 || d.seed >= LCG_M) {
    throw new Error('vae: seed 는 1 .. 2147483646 의 정수여야 한다');
  }
  const betaLadder = numList(d.betaLadder, 'betaLadder');
  if (betaLadder.length === 0) throw new Error('vae: betaLadder 가 비었다');
  if (!isNum(d.beta) || !betaLadder.includes(d.beta)) throw new Error('vae: beta 가 사다리에 없다');
  const zr = numList(d.zRange, 'zRange');
  if (zr.length !== 2 || !(zr[0] < zr[1])) throw new Error('vae: zRange 는 [아래, 위] 둘이어야 한다');
  return {
    type: 'vae',
    stepMs: d.stepMs,
    inputs,
    init: [...init],
    lr: d.lr,
    epochs: d.epochs,
    every: d.every,
    seed: d.seed,
    betaLadder: [...betaLadder],
    beta: d.beta,
    zRange: [zr[0], zr[1]],
  };
}

// ── 셈 (IR 과 같은 식) ───────────────────────────────────────────────────

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** ε 목록 — 판마다 입력 수만큼, 판 1 부터 차례로. */
export function drawEpsilons(seed: number, epochs: number, perEpoch: number): number[][] {
  let x = seed;
  const uniform = (): number => {
    x = (LCG_A * x) % LCG_M;
    return x / LCG_M;
  };
  const out: number[][] = [];
  for (let ep = 0; ep < epochs; ep += 1) {
    const row: number[] = [];
    for (let i = 0; i < perEpoch; i += 1) {
      const u1 = uniform();
      const u2 = uniform();
      row.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    }
    out.push(row);
  }
  return out;
}

/**
 * 한 판 — IR `trainEpoch` 과 같은 차례. xs 는 입력을 이은 평평한 목록 (색인 4·i + k),
 * eps 는 이 판의 ε (입력 수만큼), p 는 무게 열여덟 (고쳐 쓴다), g 는 기울기 버퍼 열여덟.
 */
export function vaeEpoch(xs: number[], eps: number[], p: number[], g: number[], beta: number, lr: number): void {
  for (let j = 0; j < p.length; j += 1) g[j] = 0.0;
  const nIn = eps.length;
  for (let i = 0; i < eps.length; i += 1) {
    let mu = p[4];
    let lv = p[9];
    for (let k = 0; k < 4; k += 1) {
      mu = mu + p[k] * xs[4 * i + k];
      lv = lv + p[5 + k] * xs[4 * i + k];
    }
    const sg = Math.exp(0.5 * lv);
    const z = mu + sg * eps[i];
    let dz = 0.0;
    for (let k = 0; k < 4; k += 1) {
      const q = sigmoid(p[10 + k] * z + p[14 + k]);
      const err = q - xs[4 * i + k];
      dz = dz + err * p[10 + k];
      g[10 + k] = g[10 + k] + err * z;
      g[14 + k] = g[14 + k] + err;
    }
    const dmu = dz + beta * mu;
    const dlv = dz * eps[i] * 0.5 * sg + beta * 0.5 * (Math.exp(lv) - 1.0);
    for (let k = 0; k < 4; k += 1) {
      g[k] = g[k] + dmu * xs[4 * i + k];
      g[5 + k] = g[5 + k] + dlv * xs[4 * i + k];
    }
    g[4] = g[4] + dmu;
    g[9] = g[9] + dlv;
  }
  for (let j = 0; j < p.length; j += 1) p[j] = p[j] - (lr * g[j]) / nIn;
}

/** 지금 무게에서 보일 값 (z = μ). */
export function readVae(p: number[], inputs: VaeInput[], epoch: number, beta: number, zRange: [number, number]): VaeSnapshot {
  const bands: VaeBand[] = [];
  const cells: VaeCells[] = [];
  let rec = 0;
  let kl = 0;
  for (const input of inputs) {
    const x = input.x;
    let mu = p[4];
    let lv = p[9];
    for (let k = 0; k < 4; k += 1) {
      mu = mu + p[k] * x[k];
      lv = lv + p[5 + k] * x[k];
    }
    const sg = Math.exp(0.5 * lv);
    const q: number[] = [];
    for (let k = 0; k < 4; k += 1) q.push(sigmoid(p[10 + k] * mu + p[14 + k]));
    let bce = 0;
    for (let k = 0; k < 4; k += 1) bce = bce - (x[k] * Math.log(q[k]) + (1 - x[k]) * Math.log(1 - q[k]));
    rec = rec + bce / 4;
    kl = kl + 0.5 * (mu * mu + Math.exp(lv) - 1 - lv);
    bands.push({ id: input.id, mu, sigma: sg, lo: mu - sg, hi: mu + sg });
    cells.push({ id: input.id, x: [...x], q });
  }
  // μ 차례 — 동률이면 적힌 차례 (Array.prototype.sort 는 안정 정렬)
  const sorted = bands.map((b, i) => ({ b, i })).sort((a, c) => a.b.mu - c.b.mu || a.i - c.i);
  const gaps: VaeGap[] = [];
  for (let n = 0; n + 1 < sorted.length; n += 1) {
    const left = sorted[n].b;
    const right = sorted[n + 1].b;
    const gap = (right.mu - right.sigma) - (left.mu + left.sigma);
    gaps.push({ left: left.id, right: right.id, gap, overlap: gap < 0 });
  }
  const mus = bands.map((b) => b.mu);
  return {
    epoch,
    beta,
    zRange,
    bands,
    order: sorted.map((s) => s.b.id),
    gaps,
    overlapCount: gaps.filter((gp) => gp.overlap).length,
    narrowestGap: Math.min(...gaps.map((gp) => gp.gap)),
    cells,
    recon: rec / inputs.length,
    kl: kl / inputs.length,
    sigmaMean: bands.reduce((s, b) => s + b.sigma, 0) / bands.length,
    muWidth: Math.max(...mus) - Math.min(...mus),
  };
}

/** 한 손잡이 값의 학습 전부 — 끝 무게와 보일 모습들 (판 0, every, …, epochs). */
export function trainVae(data: VaeData, beta: number): { weights: number[]; snapshots: VaeSnapshot[] } {
  const p = [...data.init];
  const g = new Array<number>(VAE_PARAMS).fill(0);
  const xs = data.inputs.flatMap((input) => input.x);
  const eps = drawEpsilons(data.seed, data.epochs, data.inputs.length);
  const snapshots: VaeSnapshot[] = [readVae(p, data.inputs, 0, beta, data.zRange)];
  for (let ep = 1; ep <= data.epochs; ep += 1) {
    vaeEpoch(xs, eps[ep - 1], p, g, beta, data.lr);
    if (ep % data.every === 0) snapshots.push(readVae(p, data.inputs, ep, beta, data.zRange));
  }
  return { weights: p, snapshots };
}

// ── 재생 ─────────────────────────────────────────────────────────────────

export async function vaeAlgorithm(ctx: FacetContext<VaeData>): Promise<void> {
  const rctx = ctx as ReactiveContext<VaeData>;
  const data = narrowVaeData(ctx.data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  let shownEpoch = 0;
  let shownOverlap = 0;
  let firstSend = true;
  const setMetrics = (epoch: number, overlap: number): void => {
    const dEpoch = epoch - shownEpoch;
    const dOverlap = overlap - shownOverlap;
    if (firstSend || dEpoch !== 0) ctx.metric('epoch', dEpoch);
    if (firstSend || dOverlap !== 0) ctx.metric('overlap-pairs', dOverlap);
    firstSend = false;
    shownEpoch = epoch;
    shownOverlap = overlap;
  };

  let beta = data.beta;
  for (;;) {
    if (ctx.cancelled) return;
    const { snapshots } = trainVae(data, beta);

    // 걸음 0 — 판 0 (처음 무게)
    setMetrics(0, 0);
    const first = snapshots[0];
    await ctx.emit({ type: 'init', payload: first, silent: true });
    setMetrics(first.epoch, first.overlapCount);
    await phase('encode');
    if (!(await rctx.sleep(data.stepMs))) return;

    // 걸음 1..8 — every 판마다
    for (let n = 1; n < snapshots.length; n += 1) {
      if (ctx.cancelled) return;
      const snap = snapshots[n];
      await phase('kl-pull');
      await ctx.emit({ type: 'snapshot', payload: snap });
      setMetrics(snap.epoch, snap.overlapCount);
      if (n + 1 < snapshots.length && !(await rctx.sleep(data.stepMs))) return;
    }

    // 손잡이를 기다린다
    const next = await waitBeta(rctx, data.betaLadder);
    if (next === null) return;
    beta = next;
  }
}

async function waitBeta(ctx: ReactiveContext<VaeData>, ladder: number[]): Promise<number | null> {
  for (;;) {
    if (ctx.cancelled) return null;
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return null;
    if (input.type !== 'beta') continue;
    const payload = input.payload;
    if (typeof payload !== 'object' || payload === null) throw new Error('vae: beta 입력에 payload 가 없다');
    const value = (payload as { value?: unknown }).value;
    if (typeof value !== 'number' || !ladder.includes(value)) {
      throw new Error(`vae: beta 값 ${String(value)} 이 사다리에 없다`);
    }
    return value;
  }
}
