/**
 * clt — 표본 평균의 분포 (중심 극한).
 *
 * 모집단 넷(눈 1..6 의 무게, 합 36) 가운데 하나에서 눈 n 개를 뽑아 평균 하나를 만들고, 그것을 400 번
 * 되풀이해 평균 400 개를 칸 열하나(가운데 1.0 · 1.5 · … · 6.0)에 센다. 손잡이 둘(모집단 · 한 평균에 넣는 수 n)
 * 을 돌리면 같은 차례로 판 하나(걸음 다섯)를 다시 돈다.
 *
 * ## 뽑는 차례 (사양 그대로 — 하나라도 다르면 대조가 어긋난다)
 * 모집단마다 생성기를 새로 `mulberry32(seed)` 로 만든다 → n 을 사다리 차례로(1 · 2 · 6 · 10 · 30) →
 * 한 n 안에서 평균 400 개를 차례로 → 한 평균 안에서 눈 n 개를 차례로.
 * 눈 하나 = `u = floor(rng() × 36)` 이 무게를 차례로 더한 누적 가운데 처음으로 `u < 누적` 인 눈.
 * 같은 조합이면 늘 같은 표본이다 — 판을 거듭해도 수가 바뀌지 않는다.
 *
 * ## 셈 (IR 과 같은 길)
 * - 칸 번호 j = (4s − 3n) // (2n). s < n 이거나 나머지가 0(칸 경계)이면 던진다 — IR 은 −1 표지.
 * - 평균들의 평균 = (합들의 합, double 에 차례로) ÷ (400 × n) — 나눗셈 한 번.
 * - 폭 = √( Σ (s/n − 평균들의 평균)² / 400 ), 합 배열 차례대로.
 * - 모집단 μ = Σ 눈 × 무게 / 36, σ = √( Σ 무게 × (눈 − μ)² / 36 ).
 * - 봉우리 수 = 빈 칸을 빼고, 같은 개수가 이어지면 한 덩이로 본 뒤, 양옆보다 높은 덩이를 센다
 *   (양 끝 너머는 −1). 동률(이웃 덩이와 같은 개수)은 덩이로 합쳐지므로 "양옆보다 높다" 의 비교에 걸리지 않는다.
 * - 축척 — 칸 세로 최대는 스무 조합 전체의 가장 높은 칸, 막대 세로 최대는 무게 최대. init 에 싣는다.
 *
 * ## 이벤트 (모두 `await ctx.emit`)
 * - `init` (silent) — 판 머리. payload
 *   `{ population: number, popId: string, weights: number[6], mu: number, sigma: number, n: number,
 *      weightMax: number, countMax: number, binCount: number, motionMs: number }`
 * - `phase` (silent) — `{ phase: 'bin' | 'count' | 'mean' | 'spread' }`. 걸음 발신 바로 앞.
 * - `one-mean` — 걸음 1. `{ faces: number[n], sum: number, n: number, oneMean: number, bin: number, binCenter: number }`
 * - `counts` — 걸음 2. `{ counts: number[11], means: number, peaks: number, tallest: number }`
 * - `grand-mean` — 걸음 3. `{ mean: number, mu: number }`
 * - `spread` — 걸음 4. `{ spread: number, sigma: number, n: number, theory: number, mean: number }`
 *
 * ## phase 어휘 (irs.ts 와 같다)
 * `bin` · `count` · `mean` · `spread` — 걸음 1..4 가 하나씩 켠다.
 *
 * ## 계기
 * - `peaks` — 판 머리 0 (차이 0 이어도 보낸다) → 걸음 2 에 이 판의 봉우리 수
 * - `tallest-bin` — 판 머리 0 → 걸음 2 에 이 판의 가장 높은 칸
 *
 * ## 걸음 길이
 * init 뒤와 걸음 1..3 뒤에 `sleep(stepMs + MOTION_MS)`. 걸음 4 뒤는 입력 대기.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 걸음의 운동 길이(ms, 속도 1 기준). 무대가 init payload 로 받는다. */
export const MOTION_MS = 700;
/** 칸 수 — 가운데 1.0 … 6.0, 폭 0.5. */
export const BIN_COUNT = 11;
/** 무게의 합 (눈 하나 = floor(rng × 36)). */
const WEIGHT_TOTAL = 36;
const FACE_COUNT = 6;

export type CltPopulation = { id: string; weights: number[] };

export type CltData = {
  type: 'clt';
  stepMs: number;
  seed: number;
  meansPerRun: number;
  populations: CltPopulation[];
  perMeanLadder: number[];
  population: number;
  perMean: number;
};

// ── 좁히개 ─────────────────────────────────────────────────────────────

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

/** `ctx.data` 를 믿지 않고 모양을 확인한다 — 어긋나면 던진다 (C6 · C9). */
export function narrowCltData(raw: unknown): CltData {
  if (typeof raw !== 'object' || raw === null) throw new Error('clt: 데이터가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'clt') throw new Error('clt: type 이 clt 가 아니다');
  const { stepMs, seed, meansPerRun, populations, perMeanLadder, population, perMean } = r;
  if (!isInt(stepMs) || stepMs <= 0) throw new Error('clt: stepMs');
  if (!isInt(seed)) throw new Error('clt: seed');
  if (!isInt(meansPerRun) || meansPerRun <= 0) throw new Error('clt: meansPerRun');
  if (!Array.isArray(populations) || populations.length === 0) throw new Error('clt: populations');
  const pops: CltPopulation[] = populations.map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new Error(`clt: populations[${i}]`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string') throw new Error(`clt: populations[${i}].id`);
    const w = q.weights;
    if (!Array.isArray(w) || w.length !== FACE_COUNT || !w.every((x) => isInt(x) && x >= 0)) {
      throw new Error(`clt: populations[${i}].weights`);
    }
    const ws = w as number[];
    if (ws.reduce((a, b) => a + b, 0) !== WEIGHT_TOTAL) throw new Error(`clt: populations[${i}] 무게 합이 36 이 아니다`);
    return { id: q.id, weights: [...ws] };
  });
  if (!Array.isArray(perMeanLadder) || perMeanLadder.length === 0 || !perMeanLadder.every((x) => isInt(x) && x >= 1)) {
    throw new Error('clt: perMeanLadder');
  }
  const ladder = [...(perMeanLadder as number[])];
  if (!isInt(population) || population < 0 || population >= pops.length) throw new Error('clt: population');
  if (!isInt(perMean) || !ladder.includes(perMean)) throw new Error('clt: perMean 이 사다리에 없다');
  return { type: 'clt', stepMs, seed, meansPerRun, populations: pops, perMeanLadder: ladder, population, perMean };
}

// ── 생성기 (비트 연산 — IR 밖) ───────────────────────────────────────────

/** mulberry32 — prob common 의 생성기 그대로. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), a | 1);
    x = (x + Math.imul(x ^ (x >>> 7), x | 61)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 눈 하나 — floor(u × 36) 이 떨어지는 무게 칸 (1..6). */
export function drawFace(rng: () => number, weights: readonly number[]): number {
  const u = Math.floor(rng() * WEIGHT_TOTAL);
  let acc = 0;
  for (let k = 0; k < weights.length; k++) {
    acc += weights[k]!;
    if (u < acc) return k + 1;
  }
  throw new Error('clt: 무게 합이 36 이 아니다');
}

export type CltDraw = { sums: number[]; first: number[] };

/** 모집단 하나를 사다리 차례대로 뽑는다 — n → (합 배열, 첫 평균의 눈). */
export function drawPopulation(seed: number, weights: readonly number[], ladder: readonly number[], means: number): Map<number, CltDraw> {
  const rng = mulberry32(seed);
  const out = new Map<number, CltDraw>();
  for (const n of ladder) {
    const sums: number[] = [];
    let first: number[] | null = null;
    for (let i = 0; i < means; i++) {
      const faces: number[] = [];
      for (let k = 0; k < n; k++) faces.push(drawFace(rng, weights));
      if (i === 0) first = faces;
      sums.push(faces.reduce((a, b) => a + b, 0));
    }
    if (first === null) throw new Error('clt: 평균이 하나도 없다');
    out.set(n, { sums, first });
  }
  return out;
}

// ── IR 과 같은 길의 셈 ──────────────────────────────────────────────────

/** 칸 번호 (4s − 3n) // (2n). s < n 이나 칸 경계는 던진다 (IR 은 −1). */
export function binOf(s: number, n: number): number {
  if (s < n) throw new Error(`clt: 합 ${s} 이 n ${n} 보다 작다`);
  const num = 4 * s - 3 * n;
  if (num % (2 * n) === 0) throw new Error(`clt: 칸 경계 s=${s} n=${n}`);
  return Math.floor(num / (2 * n));
}

/** 칸 가운데 — 바탕에서 정해지는 좌표 (무대도 부를 수 있다). */
export function binCenter(j: number): number {
  return 1 + 0.5 * j;
}

export function countInBin(sums: readonly number[], n: number, j: number): number {
  let c = 0;
  for (let i = 0; i < sums.length; i++) {
    if (binOf(sums[i]!, n) === j) c = c + 1;
  }
  return c;
}

export function meanOf(sums: readonly number[], n: number): number {
  let total = 0;
  for (let i = 0; i < sums.length; i++) total = total + sums[i]!;
  const denom = sums.length * n;
  return total / denom;
}

export function spreadOf(sums: readonly number[], n: number): number {
  const m = meanOf(sums, n);
  let acc = 0;
  for (let i = 0; i < sums.length; i++) {
    let x = sums[i]!;
    x = x / n;
    const d = x - m;
    acc = acc + d * d;
  }
  return Math.sqrt(acc / sums.length);
}

/** 봉우리 수 — 빈 칸을 빼고, 같은 개수가 이어지면 한 덩이, 양옆(끝 너머 −1)보다 높은 덩이. */
export function peaksOf(counts: readonly number[]): number {
  const xs = counts.filter((x) => x > 0);
  const run = xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
  let cnt = 0;
  for (let i = 0; i < run.length; i++) {
    const left = i > 0 ? run[i - 1]! : -1;
    const right = i < run.length - 1 ? run[i + 1]! : -1;
    if (run[i]! > left && run[i]! > right) cnt++;
  }
  return cnt;
}

/** 모집단 μ · σ (분모 36). */
export function populationStats(weights: readonly number[]): { mu: number; sigma: number } {
  let m = 0;
  for (let k = 0; k < weights.length; k++) m += (k + 1) * weights[k]!;
  const mu = m / WEIGHT_TOTAL;
  let v = 0;
  for (let k = 0; k < weights.length; k++) v += weights[k]! * (k + 1 - mu) * (k + 1 - mu);
  return { mu, sigma: Math.sqrt(v / WEIGHT_TOTAL) };
}

export type CltCombo = {
  counts: number[];
  mean: number;
  spread: number;
  theory: number;
  peaks: number;
  tallest: number;
  first: number[];
  firstSum: number;
  firstBin: number;
  sums: number[];
};

export type CltTable = {
  stats: { mu: number; sigma: number }[];
  combos: Map<string, CltCombo>;
  countMax: number;
  weightMax: number;
};

export const comboKey = (pop: number, n: number): string => `${pop}:${n}`;

/** 스무 조합 전부 — 축척(가장 높은 칸)은 전체에서 잡아야 해서 처음에 다 뽑는다. */
export function buildTable(data: CltData): CltTable {
  const combos = new Map<string, CltCombo>();
  const stats: { mu: number; sigma: number }[] = [];
  let countMax = 0;
  let weightMax = 0;
  data.populations.forEach((pop, pi) => {
    const st = populationStats(pop.weights);
    stats.push(st);
    for (const w of pop.weights) weightMax = Math.max(weightMax, w);
    const drawn = drawPopulation(data.seed, pop.weights, data.perMeanLadder, data.meansPerRun);
    for (const n of data.perMeanLadder) {
      const d = drawn.get(n);
      if (!d) throw new Error(`clt: n ${n} 표본이 없다`);
      const counts: number[] = [];
      for (let j = 0; j < BIN_COUNT; j++) counts.push(countInBin(d.sums, n, j));
      if (counts.reduce((a, b) => a + b, 0) !== data.meansPerRun) throw new Error('clt: 칸 밖의 평균이 있다');
      const tallest = Math.max(...counts);
      countMax = Math.max(countMax, tallest);
      const firstSum = d.first.reduce((a, b) => a + b, 0);
      combos.set(comboKey(pi, n), {
        counts,
        mean: meanOf(d.sums, n),
        spread: spreadOf(d.sums, n),
        theory: st.sigma / Math.sqrt(n),
        peaks: peaksOf(counts),
        tallest,
        first: d.first,
        firstSum,
        firstBin: binOf(firstSum, n),
        sums: d.sums,
      });
    }
  });
  return { stats, combos, countMax, weightMax };
}

// ── 알고리즘 ─────────────────────────────────────────────────────────────

export async function cltAlgorithm(ctx: FacetContext<CltData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CltData>;
  const data = narrowCltData(ctx.data);
  const table = buildTable(data);
  const pause = (): Promise<boolean> => rctx.sleep(data.stepMs + MOTION_MS);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다.
  const shown: Record<'peaks' | 'tallest-bin', number> = { peaks: 0, 'tallest-bin': 0 };
  const setMetric = (name: 'peaks' | 'tallest-bin', value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  let pop = data.population;
  let n = data.perMean;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const combo = table.combos.get(comboKey(pop, n));
      const st = table.stats[pop];
      const popDef = data.populations[pop];
      if (!combo || !st || !popDef) throw new Error(`clt: 조합 ${pop}·${n} 이 없다`);

      // 걸음 0 — 판 머리
      setMetric('peaks', 0);
      setMetric('tallest-bin', 0);
      await ctx.emit({
        type: 'init',
        payload: {
          population: pop,
          popId: popDef.id,
          weights: [...popDef.weights],
          mu: st.mu,
          sigma: st.sigma,
          n,
          weightMax: table.weightMax,
          countMax: table.countMax,
          binCount: BIN_COUNT,
          motionMs: MOTION_MS,
        },
        silent: true,
      });
      if (!(await pause())) return;

      // 걸음 1 — 평균 하나
      await phase('bin');
      await ctx.emit({
        type: 'one-mean',
        payload: {
          faces: [...combo.first],
          sum: combo.firstSum,
          n,
          oneMean: combo.firstSum / n,
          bin: combo.firstBin,
          binCenter: binCenter(combo.firstBin),
        },
      });
      if (!(await pause())) return;

      // 걸음 2 — 평균 400 개
      await phase('count');
      setMetric('peaks', combo.peaks);
      setMetric('tallest-bin', combo.tallest);
      await ctx.emit({
        type: 'counts',
        payload: { counts: [...combo.counts], means: data.meansPerRun, peaks: combo.peaks, tallest: combo.tallest },
      });
      if (!(await pause())) return;

      // 걸음 3 — 평균들의 평균
      await phase('mean');
      await ctx.emit({ type: 'grand-mean', payload: { mean: combo.mean, mu: st.mu } });
      if (!(await pause())) return;

      // 걸음 4 — 폭
      await phase('spread');
      await ctx.emit({
        type: 'spread',
        payload: { spread: combo.spread, sigma: st.sigma, n, theory: combo.theory, mean: combo.mean },
      });

      // 입력 대기 — 우리 것이 아닌 type 은 흘리고, 제 type 인데 값이 어긋나면 던진다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'population' && input.type !== 'perMean') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') throw new Error(`clt: ${input.type} 값이 수가 아니다`);
        if (input.type === 'population') {
          if (!Number.isInteger(value) || value < 0 || value >= data.populations.length) {
            throw new Error(`clt: 모집단 ${value} 이 사다리 밖이다`);
          }
          pop = value;
        } else {
          if (!data.perMeanLadder.includes(value)) throw new Error(`clt: n ${value} 이 사다리 밖이다`);
          n = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
