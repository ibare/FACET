/**
 * brdf — 반사 모형: 퐁 · PBR 의 정반사 한 몫 (수직 입사 · 조도 1)
 *
 * 한 점에 빛이 법선 방향에서(수직 입사) 조도 1 로 들어온다. 광택(퐁 지수 n)을 올리면 번쩍임이 좁아진다 —
 * 퐁은 봉우리를 그대로 둔 채 나가는 빛의 총량을 잃고, PBR(쿡–토런스) 은 봉우리를 솟구치며 총량을 들어온 빛 밑에 둔다.
 *
 * 규약 (공통 안내문 · 사양):
 *   μ = cosθ_o = N·V. 빛이 법선에서 오므로 N·L = 1, 퐁의 R = N 이라 R·V = μ,
 *   PBR 의 H 는 L 과 V 의 반이라 N·H = V·H = √((1 + μ)/2).
 *   나간 빛의 휘도 L(μ) = f · E · N·L, E = IRRADIANCE = 1, N·L = N_DOT_L = 1.
 *   - 퐁  L(μ) = k_s · μ^n (정규화하지 않은 퐁)
 *   - PBR α = √(2/(n+2)), a2 = α², D = a2 / (π((N·H)²(a2 − 1) + 1)²), F = F0 + (1 − F0)(1 − V·H)^5,
 *         k = α/2, G = G1(N·L)·G1(N·V), G1(x) = x / (x(1 − k) + k), f = D·F·G / (4 N·L N·V)
 *   로브   I(θ) = L(μ)·μ, 제 봉우리 I(0) 로 나눈 모양을 −lobeMaxDeg..lobeMaxDeg, lobeStepDeg 간격으로
 *   봉우리 = I(θ = 0) = L(1)
 *   반폭각 = I 가 봉우리의 절반이 되는 θ — μ 로 이분 탐색(80 번) 후 acos. 표시는 정수 도
 *   총량   = 2π Σ L(μ_k)·μ_k / m, μ_k = (k + 0.5)/m (중점 규칙, m = samples) — 들어온 빛 1 과 견준다
 *   지수는 곱 되풀이(퐁 μ^n 은 n 번, Schlick 의 5 제곱은 x·x·x·x·x). pow 를 쓰지 않는다 — IR 과 같은 셈 차례.
 *
 * 동률 — 만나면 던진다 (사양이 사다리에서 뺐다):
 *   - 총량이 들어온 빛과 같다 (|총량 − 1| < 1e−9) — "넘는가" 를 가를 수 없다
 *   - 반폭각이 정수 반올림의 절반 자리에 있다 (소수부가 0.5 에서 1e−9 안) — 표시 도가 갈린다
 *   - 로브가 θ 에 단조로 줄지 않는다 (반폭각이 하나로 정해지지 않는다)
 *   이 데이터(모형 2 × 광택 5)에서는 셋 다 걸리지 않는다 — test 가 센다.
 *
 * 이벤트 (payload 스키마):
 *   init  (silent) { round, model: 'phong'|'pbr', n, alpha, roughness, motionMs,
 *                    axis: { peakTicks: {label, frac}[], totalTicks: {label, frac}[], incoming, incomingFrac } }
 *                    — 판 머리. 축은 사다리 전체(모형 × 광택)에서 셈한다
 *   phase (silent) { phase: 'peak' | 'lobe' | 'integrate' }
 *   peak           { peak, peakFrac }                       — 걸음 1
 *   lobe           { samples: {deg, shape}[], halfWidthDeg, halfWidthShown, halfLevel } — 걸음 2
 *   integrate      { total, totalFrac, incoming, incomingFrac, exceeds }  — 걸음 3
 *
 * phase 어휘: peak · lobe · integrate (irs.ts 와 같은 집합)
 *
 * 계기: half-width — 판 머리에서 0, 걸음 2 에서 이 판의 반폭각(정수 도)
 *
 * 손잡이 (reactive):
 *   set-model  value ∈ 0..models.length−1 (0 퐁 · 1 PBR)
 *   set-gloss  value ∈ glossLadder (퐁 지수 n)
 *
 * 판: silent init → sleep(stepMs + motionMs) → peak → sleep(stepMs) → lobe → sleep(stepMs) → integrate → 입력 대기
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BrdfData = {
  type: 'brdf';
  stepMs: number;
  motionMs: number;
  models: string[];
  glossLadder: number[];
  defaultModel: number;
  defaultGloss: number;
  ks: number;
  f0: number;
  samples: number;
  lobeStepDeg: number;
  lobeMaxDeg: number;
};

/** 조도 — 빛은 법선 방향에서 이 세기로 들어온다 (규약) */
export const IRRADIANCE = 1;
/** 수직 입사 — N·L */
export const N_DOT_L = 1;
/** 반폭각이 가리키는 세기의 몫 (봉우리의 절반) */
export const HALF_LEVEL = 0.5;
/** IR 과 같은 π 리터럴 */
const PI = 3.141592653589793;
/** 모형 식별자 → IR 의 모형 번호 */
const MODEL_CODE: Record<string, number> = { phong: 0, pbr: 1 };

const TIE_EPS = 1e-9;

export function narrowBrdfData(raw: unknown): BrdfData {
  if (typeof raw !== 'object' || raw === null) throw new Error('brdf: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'brdf') throw new Error(`brdf: initialData.type 이 'brdf' 가 아니다 (${String(r.type)})`);
  const num = (k: string): number => {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`brdf: initialData.${k} 가 수가 아니다`);
    return v;
  };
  const models = r.models;
  if (!Array.isArray(models) || models.length === 0 || !models.every((m) => typeof m === 'string' && m in MODEL_CODE)) {
    throw new Error('brdf: initialData.models 는 phong · pbr 식별자의 목록이어야 한다');
  }
  const ladder = r.glossLadder;
  if (!Array.isArray(ladder) || ladder.length === 0 || !ladder.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 1)) {
    throw new Error('brdf: initialData.glossLadder 는 1 이상 정수의 목록이어야 한다');
  }
  const data: BrdfData = {
    type: 'brdf',
    stepMs: num('stepMs'),
    motionMs: num('motionMs'),
    models: models as string[],
    glossLadder: ladder as number[],
    defaultModel: num('defaultModel'),
    defaultGloss: num('defaultGloss'),
    ks: num('ks'),
    f0: num('f0'),
    samples: num('samples'),
    lobeStepDeg: num('lobeStepDeg'),
    lobeMaxDeg: num('lobeMaxDeg'),
  };
  if (!Number.isInteger(data.defaultModel) || data.defaultModel < 0 || data.defaultModel >= data.models.length) {
    throw new Error(`brdf: defaultModel ${data.defaultModel} 이 모형 목록 밖이다`);
  }
  if (!data.glossLadder.includes(data.defaultGloss)) throw new Error(`brdf: defaultGloss ${data.defaultGloss} 가 사다리 밖이다`);
  if (!Number.isInteger(data.samples) || data.samples < 1) throw new Error('brdf: samples 는 1 이상 정수');
  if (data.lobeStepDeg <= 0 || data.lobeMaxDeg <= 0 || data.lobeMaxDeg >= 90) throw new Error('brdf: 로브 표본 범위가 반구 밖이다');
  return data;
}

function modelCode(model: string): number {
  const code = MODEL_CODE[model];
  if (code === undefined) throw new Error(`brdf: 모르는 모형 ${model}`);
  return code;
}

/**
 * 나간 빛의 휘도 L(μ) — IR `reflectRadiance` 와 같은 셈 차례 (조도 1 · N·L 1 을 곱한 값과 같다).
 * IR 은 모르는 모형에 −1 을 돌려주지만 여기서는 던진다.
 */
export function reflectRadiance(code: number, mu: number, n: number, ks: number, f0: number): number {
  if (!(mu > 0 && mu <= 1)) throw new Error(`brdf: 반구 밖 μ ${mu}`);
  if (code === 0) {
    let p = 1;
    for (let j = 0; j < n; j++) p = p * mu;
    return ks * p * IRRADIANCE * N_DOT_L;
  }
  if (code === 1) {
    const nn = n;
    const alpha = Math.sqrt(2 / (nn + 2));
    const a2 = alpha * alpha;
    const nh = Math.sqrt((1 + mu) / 2);
    const dd = nh * nh * (a2 - 1) + 1;
    const dist = a2 / (PI * dd * dd);
    const x = 1 - nh;
    const fres = f0 + (1 - f0) * x * x * x * x * x;
    const kk = alpha / 2;
    const nl = N_DOT_L;
    const geo = (nl / (nl * (1 - kk) + kk)) * (mu / (mu * (1 - kk) + kk));
    return ((dist * fres * geo) / (4 * nl * mu)) * IRRADIANCE * nl;
  }
  throw new Error(`brdf: 모르는 모형 번호 ${code}`);
}

/** 총량 — IR `reflectTotal` 과 같은 셈 차례 (중점 규칙) */
export function reflectTotal(code: number, n: number, ks: number, f0: number, m: number): number {
  let s = 0;
  for (let k = 0; k < m; k++) {
    const mu = (k + 0.5) / m;
    s = s + reflectRadiance(code, mu, n, ks, f0) * mu;
  }
  return (2 * PI * s) / m;
}

export type BrdfResult = {
  model: string;
  n: number;
  alpha: number;
  roughness: number;
  peak: number;
  total: number;
  halfWidthDeg: number;
  halfWidthShown: number;
  samples: { deg: number; shape: number }[];
};

/** 한 칸(모형 · 광택)의 모든 파생값 */
export function computeBrdf(data: BrdfData, model: string, n: number): BrdfResult {
  const code = modelCode(model);
  const intensity = (mu: number): number => reflectRadiance(code, mu, n, data.ks, data.f0) * mu;
  const peak = reflectRadiance(code, 1, n, data.ks, data.f0);
  if (!(peak > 0)) throw new Error(`brdf: ${model} n ${n} 의 봉우리가 양수가 아니다`);
  const total = reflectTotal(code, n, data.ks, data.f0, data.samples);

  // 반폭각 — I(μ) 는 μ 에 단조(아래 표본 검사) → 이분 탐색
  const target = peak * HALF_LEVEL;
  let lo = 1e-9;
  let hi = 1;
  if (!(intensity(lo) < target)) throw new Error(`brdf: ${model} n ${n} 은 반구 끝에서도 절반 밑으로 내려가지 않는다`);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (intensity(mid) < target) lo = mid;
    else hi = mid;
  }
  const halfWidthDeg = (Math.acos((lo + hi) / 2) * 180) / Math.PI;
  const frac = halfWidthDeg - Math.floor(halfWidthDeg);
  if (Math.abs(frac - 0.5) < TIE_EPS) throw new Error(`brdf: ${model} n ${n} 의 반폭각 ${halfWidthDeg} 가 반올림 절반 자리다`);
  const halfWidthShown = Math.round(halfWidthDeg);

  // 로브 표본 — 제 봉우리로 나눈 모양
  const samples: { deg: number; shape: number }[] = [];
  const steps = Math.round(data.lobeMaxDeg / data.lobeStepDeg);
  if (Math.abs(steps * data.lobeStepDeg - data.lobeMaxDeg) > TIE_EPS) throw new Error('brdf: lobeMaxDeg 가 lobeStepDeg 의 배수가 아니다');
  for (let i = -steps; i <= steps; i++) {
    const deg = i * data.lobeStepDeg;
    const mu = i === 0 ? 1 : Math.cos((deg * Math.PI) / 180);
    samples.push({ deg, shape: intensity(mu) / peak });
  }
  for (let i = steps; i < 2 * steps; i++) {
    // 가운데에서 바깥으로 줄어야 한다 (좌우 대칭이라 오른쪽 반만 본다)
    if (samples[i + 1].shape > samples[i].shape) throw new Error(`brdf: ${model} n ${n} 의 로브가 θ 에 단조로 줄지 않는다`);
  }

  const alpha = Math.sqrt(2 / (n + 2));
  return { model, n, alpha, roughness: Math.sqrt(alpha), peak, total, halfWidthDeg, halfWidthShown, samples };
}

export type BrdfAxis = {
  peakTicks: { label: string; frac: number }[];
  totalTicks: { label: string; frac: number }[];
  incoming: number;
  incomingFrac: number;
  peakLogLo: number;
  peakLogHi: number;
  totalMax: number;
};

/** 축 — 사다리 전체(모형 × 광택)의 봉우리 · 총량이 들어가게. 봉우리는 십 배 눈금 로그 축, 총량은 0.2 눈금 */
export function computeAxis(results: BrdfResult[]): BrdfAxis {
  if (results.length === 0) throw new Error('brdf: 축을 셈할 칸이 없다');
  const peaks = results.map((r) => r.peak);
  const totals = results.map((r) => r.total);
  const peakLogLo = Math.floor(Math.log10(Math.min(...peaks)));
  const peakLogHi = Math.ceil(Math.log10(Math.max(...peaks)));
  if (peakLogHi <= peakLogLo) throw new Error('brdf: 봉우리 축의 폭이 0 이다');
  const peakTicks: { label: string; frac: number }[] = [];
  for (let e = peakLogLo; e <= peakLogHi; e++) {
    const v = 10 ** e;
    peakTicks.push({ label: e < 0 ? v.toFixed(-e) : String(v), frac: (e - peakLogLo) / (peakLogHi - peakLogLo) });
  }
  // 총량 축 — 0.2 칸 단위로 가장 큰 총량과 들어온 빛을 덮는다 (칸 단위를 정수로 센다)
  const topFifths = Math.ceil(Math.max(Math.max(...totals), IRRADIANCE) * 5);
  const totalMax = topFifths / 5;
  const totalTicks: { label: string; frac: number }[] = [];
  for (let k = 0; k <= topFifths; k++) totalTicks.push({ label: k === 0 ? '0' : (k / 5).toFixed(1), frac: k / topFifths });
  return {
    peakTicks,
    totalTicks,
    incoming: IRRADIANCE,
    incomingFrac: IRRADIANCE / totalMax,
    peakLogLo,
    peakLogHi,
    totalMax,
  };
}

export function peakFrac(axis: BrdfAxis, peak: number): number {
  return (Math.log10(peak) - axis.peakLogLo) / (axis.peakLogHi - axis.peakLogLo);
}

export async function brdfAlgorithm(ctx: FacetContext<BrdfData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BrdfData>;
  const data = narrowBrdfData(ctx.data);

  // 사다리 전체를 한 번 셈한다 — 축과 판마다의 값
  const table = new Map<string, BrdfResult>();
  for (const model of data.models) {
    for (const n of data.glossLadder) table.set(`${model}:${n}`, computeBrdf(data, model, n));
  }
  const axis = computeAxis([...table.values()]);

  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    const prev = shown[name];
    const delta = prev === undefined ? value : value - prev;
    shown[name] = value;
    if (prev === undefined || delta !== 0) ctx.metric(name, delta);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let modelIndex = data.defaultModel;
  let gloss = data.defaultGloss;
  let round = 0;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      round++;
      const model = data.models[modelIndex];
      const res = table.get(`${model}:${gloss}`);
      if (!res) throw new Error(`brdf: ${model} n ${gloss} 의 값이 없다`);
      if (Math.abs(res.total - IRRADIANCE) < TIE_EPS) throw new Error(`brdf: ${model} n ${gloss} 의 총량이 들어온 빛과 같다`);

      // 걸음 0 — 판 머리
      setMetric('half-width', 0);
      await ctx.emit({
        type: 'init',
        payload: {
          round,
          model,
          n: gloss,
          alpha: res.alpha,
          roughness: res.roughness,
          motionMs: data.motionMs,
          axis: {
            peakTicks: axis.peakTicks,
            totalTicks: axis.totalTicks,
            incoming: axis.incoming,
            incomingFrac: axis.incomingFrac,
          },
        },
        silent: true,
      });
      if (!(await rctx.sleep(data.stepMs + data.motionMs))) return;

      // 걸음 1 — 거울 방향의 세기
      if (ctx.cancelled) return;
      await phase('peak');
      await ctx.emit({ type: 'peak', payload: { peak: res.peak, peakFrac: peakFrac(axis, res.peak) } });
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 2 — 로브 전체 · 반폭각
      if (ctx.cancelled) return;
      await phase('lobe');
      await ctx.emit({
        type: 'lobe',
        payload: {
          samples: res.samples,
          halfWidthDeg: res.halfWidthDeg,
          halfWidthShown: res.halfWidthShown,
          halfLevel: HALF_LEVEL,
        },
      });
      setMetric('half-width', res.halfWidthShown);
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 3 — 반구 적분
      if (ctx.cancelled) return;
      await phase('integrate');
      await ctx.emit({
        type: 'integrate',
        payload: {
          total: res.total,
          totalFrac: res.total / axis.totalMax,
          incoming: axis.incoming,
          incomingFrac: axis.incomingFrac,
          exceeds: res.total > axis.incoming,
        },
      });

      // 손잡이 대기
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (input.type === 'set-model') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= data.models.length) {
            throw new Error(`brdf: set-model 값 ${String(value)} 이 모형 목록 밖이다`);
          }
          modelIndex = value;
          break;
        }
        if (input.type === 'set-gloss') {
          if (typeof value !== 'number' || !data.glossLadder.includes(value)) {
            throw new Error(`brdf: set-gloss 값 ${String(value)} 이 광택 사다리 밖이다`);
          }
          gloss = value;
          break;
        }
        continue; // 우리 것이 아닌 입력
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
