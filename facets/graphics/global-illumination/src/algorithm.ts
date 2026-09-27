/**
 * global-illumination — 평면(2 차원) 래디오시티. 방 4×4 · 패치 열여섯 · 빛은 천장 가운데 두 패치.
 *
 * 튐 k 마다 모든 패치가 앞 튐의 값으로 함께 모은다 (야코비 — 버퍼 둘):
 *   B_k(i) = E(i) + ρ_i · Σ_j F(i→j) · B_{k−1}(j)      채널마다 (R · G · B)
 * 형태 계수 F 는 교차 끈(Hottel) — |(|a_i d_j| + |b_i c_j|) − (|a_i c_j| + |b_i d_j|)| / (2·|a_i b_i|).
 * 볼록 방이라 가림이 없다. 반사율 ρ_i = ρ × tint(종류) — 채널마다.
 *
 * 빛의 양 = 세 채널 평균. 이번 튐이 더한 빛 A_k = Σ_i Σ_c (B_k − B_{k−1}) / 3,
 * 쌓인 반사광 S_k = A_1 + … + A_k (= Σ 빛의 양(B_k) − Σ 빛의 양(E)).
 * 멈춤: A_k ≤ tolerance × S_k 인 첫 k (= K). maxBounces 안에 멈추지 않으면 던진다.
 * 셈의 차례(채널 → 받는 패치 → 보내는 패치)와 A 를 모으는 길은 IR(`irs.ts`)과 같다 — 답이 비트까지 같게.
 *
 * 동률 · 경계: 멈춤 판정 A_k ≤ tol·S_k 에서 같음은 멈춤 쪽이다. 사다리의 다섯 ρ 는 멈춘 튐에서 경계의
 * 0.18 ~ 0.78 배, 그 앞 튐에서 1.34 배 이상이라 이 데이터에서 같음이 걸리지 않는다 (test 가 잰다).
 *
 * ── 이벤트 ───────────────────────────────────────────────────────────────
 *   init       (silent) 판 머리 — 걸음 0 을 갈아 끼운다
 *              { rho: number, tolerance: number, chart: { bounces: number, light: number },
 *                probe: string,
 *                patches: { id: string, kind: string, ax, ay, bx, by: number, emitter: boolean }[],
 *                formFactors: number[][]   (행 = 받는 패치, 열 = 보내는 패치),
 *                light: number[][]         (패치마다 [R, G, B] — B₀ = E),
 *                floorMean: number }        (바닥 패치 빛의 양의 평균 — B₀ 에서)
 *   phase      (silent) { phase: 'bounce' | 'converged' }
 *   bounce     튐 k — { bounce: number, light: number[][], added: number, accumulated: number,
 *                        floorMean: number, probeRgb: number[] (3), bleed: number (probe 의 R − B) }
 *   converged  멈춤 판정 — { bounce: K, added: A_K, accumulated: S_K, tolerance, limit: tolerance × S_K }
 *              (걸음 K 의 값을 다시 말할 뿐 새로 셈하지 않는다)
 *
 * ── phase 어휘 ───────────────────────────────────────────────────────────
 *   bounce · converged   (irs.ts 와 정확히 같다. 걸음 1..K 가 모두 bounce)
 *
 * ── 계기 ─────────────────────────────────────────────────────────────────
 *   bounces    멈춘 튐 K (판 머리에서 0, 판 끝에서 K)
 *   floor-red  끝 probe(f1) 의 R − B × 1000, 절반은 0 에서 먼 쪽 (판 머리에서 0)
 *
 * ── 손잡이 ───────────────────────────────────────────────────────────────
 *   reflectance  { value: ρ } — `rhos` 사다리 안의 값만 받는다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GlobalIlluminationPatch = {
  id: string;
  kind: string;
  a: number[];
  b: number[];
};

export type GlobalIlluminationData = {
  type: 'global-illumination';
  stepMs: number;
  patches: GlobalIlluminationPatch[];
  emitters: string[];
  emission: number[];
  tints: Record<string, number[]>;
  rhos: number[];
  initialRho: number;
  tolerance: number;
  maxBounces: number;
  chart: { bounces: number; light: number };
  floorKind: string;
  probe: string;
};

/** 막대가 옮겨 가는 운동의 길이 (속도 1 에서). stage 의 운동과 같은 값 */
export const GLOBAL_ILLUMINATION_MOTION_MS = 600;

const CHANNELS = 3;

function fail(msg: string): never {
  throw new Error(`global-illumination: ${msg}`);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function numberList(v: unknown, what: string, length?: number): number[] {
  if (!Array.isArray(v)) fail(`${what} 가 배열이 아니다`);
  const out: number[] = [];
  for (const x of v) {
    if (!isFiniteNumber(x)) fail(`${what} 에 수가 아닌 값이 있다`);
    out.push(x);
  }
  if (length !== undefined && out.length !== length) fail(`${what} 의 길이가 ${length} 가 아니다 (${out.length})`);
  return out;
}

/** ctx.data 좁히개 — 모양이 어긋나면 무엇이 없는지 담아 던진다 */
export function narrowGlobalIllumination(raw: unknown): GlobalIlluminationData {
  if (typeof raw !== 'object' || raw === null) fail('initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'global-illumination') fail(`initialData.type 이 global-illumination 이 아니다 (${String(d.type)})`);
  if (!isFiniteNumber(d.stepMs) || d.stepMs <= 0) fail('stepMs 가 양수가 아니다');
  if (!Array.isArray(d.patches) || d.patches.length === 0) fail('patches 가 비었다');
  const patches: GlobalIlluminationPatch[] = d.patches.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) fail(`patches[${i}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') fail(`patches[${i}].id 가 없다`);
    if (typeof q.kind !== 'string' || q.kind === '') fail(`patches[${i}].kind 가 없다`);
    return { id: q.id, kind: q.kind, a: numberList(q.a, `patches[${i}].a`, 2), b: numberList(q.b, `patches[${i}].b`, 2) };
  });
  const ids = new Set(patches.map((p) => p.id));
  if (ids.size !== patches.length) fail('patches 의 id 가 겹친다');
  if (!Array.isArray(d.emitters)) fail('emitters 가 배열이 아니다');
  const emitters = d.emitters.map((e: unknown) => {
    if (typeof e !== 'string' || !ids.has(e)) fail(`emitters 의 ${String(e)} 가 패치에 없다`);
    return e;
  });
  const emission = numberList(d.emission, 'emission', CHANNELS);
  if (typeof d.tints !== 'object' || d.tints === null) fail('tints 가 없다');
  const tintsRaw = d.tints as Record<string, unknown>;
  const tints: Record<string, number[]> = {};
  for (const p of patches) {
    if (tints[p.kind] !== undefined) continue;
    if (!(p.kind in tintsRaw)) fail(`tints 에 종류 ${p.kind} 가 없다`);
    tints[p.kind] = numberList(tintsRaw[p.kind], `tints.${p.kind}`, CHANNELS);
  }
  const rhos = numberList(d.rhos, 'rhos');
  if (rhos.length === 0) fail('rhos 가 비었다');
  for (const r of rhos) if (r <= 0 || r >= 1) fail(`rhos 의 ${r} 가 0 과 1 사이가 아니다`);
  if (!isFiniteNumber(d.initialRho) || !rhos.includes(d.initialRho)) fail('initialRho 가 사다리에 없다');
  if (!isFiniteNumber(d.tolerance) || d.tolerance <= 0) fail('tolerance 가 양수가 아니다');
  if (!isFiniteNumber(d.maxBounces) || !Number.isInteger(d.maxBounces) || d.maxBounces < 1) fail('maxBounces 가 양의 정수가 아니다');
  if (typeof d.chart !== 'object' || d.chart === null) fail('chart 가 없다');
  const chart = d.chart as Record<string, unknown>;
  if (!isFiniteNumber(chart.bounces) || chart.bounces < 1) fail('chart.bounces 가 없다');
  if (!isFiniteNumber(chart.light) || chart.light <= 0) fail('chart.light 가 없다');
  if (typeof d.floorKind !== 'string' || !patches.some((p) => p.kind === d.floorKind)) fail('floorKind 인 패치가 없다');
  if (typeof d.probe !== 'string' || !ids.has(d.probe)) fail('probe 가 패치에 없다');
  return {
    type: 'global-illumination',
    stepMs: d.stepMs,
    patches,
    emitters,
    emission,
    tints,
    rhos,
    initialRho: d.initialRho,
    tolerance: d.tolerance,
    maxBounces: d.maxBounces,
    chart: { bounces: chart.bounces, light: chart.light },
    floorKind: d.floorKind,
    probe: d.probe,
  };
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 교차 끈 형태 계수 — 패치 (a, b) 가 패치 (c, d) 를 보는 몫. IR 의 formFactor 와 같은 식 */
export function formFactor(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  const crossed = dist(ax, ay, dx, dy) + dist(bx, by, cx, cy);
  const uncrossed = dist(ax, ay, cx, cy) + dist(bx, by, dx, dy);
  return Math.abs(crossed - uncrossed) * 0.5 / dist(ax, ay, bx, by);
}

export type GlobalIlluminationStep = {
  bounce: number;
  /** 패치마다 [R, G, B] */
  light: number[][];
  added: number;
  accumulated: number;
  floorMean: number;
  probeRgb: number[];
  bleed: number;
};

export type GlobalIlluminationRun = {
  rho: number;
  formFactors: number[][];
  emitted: number[][];
  floorMean0: number;
  steps: GlobalIlluminationStep[];
  converged: number;
  /** 판 끝 probe R − B × 1000 (절반은 0 에서 먼 쪽) */
  floorRed: number;
};

/** 채널 순 버퍼(c · n + i)를 패치마다 [R, G, B] 로 */
function toPatchRgb(buf: number[], n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) out.push([buf[i], buf[n + i], buf[2 * n + i]]);
  return out;
}

function mean3(c: number[]): number {
  return (c[0] + c[1] + c[2]) / 3;
}

/** 0 에서 먼 쪽으로 반올림한 정수 */
export function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** 한 판을 끝까지 셈한다 — 모이지 않거나 축을 넘으면 던진다 */
export function computeGlobalIllumination(data: GlobalIlluminationData, rho: number): GlobalIlluminationRun {
  if (!data.rhos.includes(rho)) fail(`반사율 ${rho} 가 사다리에 없다`);
  const P = data.patches;
  const n = P.length;
  const F: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < n; j += 1) {
      row.push(i === j ? 0 : formFactor(P[i].a[0], P[i].a[1], P[i].b[0], P[i].b[1], P[j].a[0], P[j].a[1], P[j].b[0], P[j].b[1]));
    }
    F.push(row);
  }
  const emit: number[] = new Array<number>(CHANNELS * n).fill(0);
  const reflect: number[] = new Array<number>(CHANNELS * n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const tint = data.tints[P[i].kind];
    if (tint === undefined) fail(`종류 ${P[i].kind} 의 tint 가 없다`);
    const glows = data.emitters.includes(P[i].id);
    for (let c = 0; c < CHANNELS; c += 1) {
      reflect[c * n + i] = rho * tint[c];
      if (glows) emit[c * n + i] = data.emission[c];
    }
  }
  const floorIdx = P.map((p, i) => (p.kind === data.floorKind ? i : -1)).filter((i) => i >= 0);
  const probeIdx = P.findIndex((p) => p.id === data.probe);
  if (probeIdx < 0) fail(`probe ${data.probe} 가 패치에 없다`);
  const floorMeanOf = (rgb: number[][]) => floorIdx.reduce((s, i) => s + mean3(rgb[i]), 0) / floorIdx.length;

  let prev = emit.slice();
  let emitted = 0;
  for (const v of emit) emitted += v;
  emitted /= 3;
  let total = emitted;
  const steps: GlobalIlluminationStep[] = [];
  for (let k = 1; k <= data.maxBounces; k += 1) {
    const next: number[] = new Array<number>(CHANNELS * n).fill(0);
    let added = 0;
    for (let c = 0; c < CHANNELS; c += 1) {
      for (let i = 0; i < n; i += 1) {
        let gathered = 0;
        for (let j = 0; j < n; j += 1) gathered = gathered + F[i][j] * prev[c * n + j];
        next[c * n + i] = emit[c * n + i] + reflect[c * n + i] * gathered;
        added = added + (next[c * n + i] - prev[c * n + i]);
      }
    }
    added = added / 3;
    prev = next;
    total = total + added;
    const accumulated = total - emitted;
    const light = toPatchRgb(prev, n);
    const probeRgb = light[probeIdx];
    const step: GlobalIlluminationStep = {
      bounce: k,
      light,
      added,
      accumulated,
      floorMean: floorMeanOf(light),
      probeRgb,
      bleed: probeRgb[0] - probeRgb[2],
    };
    if (k > data.chart.bounces) fail(`튐 ${k} 가 그래프 축 ${data.chart.bounces} 를 넘는다`);
    if (step.floorMean > data.chart.light) fail(`바닥 평균 ${step.floorMean} 가 축 ${data.chart.light} 를 넘는다`);
    for (let i = 0; i < n; i += 1) {
      if (data.emitters.includes(P[i].id)) continue;
      for (const v of light[i]) if (v > data.chart.light) fail(`${P[i].id} 의 빛 ${v} 가 막대 축 ${data.chart.light} 를 넘는다`);
    }
    steps.push(step);
    if (added <= data.tolerance * accumulated) {
      return {
        rho,
        formFactors: F,
        emitted: toPatchRgb(emit, n),
        floorMean0: floorMeanOf(toPatchRgb(emit, n)),
        steps,
        converged: k,
        floorRed: roundHalfAway(step.bleed * 1000),
      };
    }
  }
  return fail(`반사율 ${rho} 에서 ${data.maxBounces} 튐 안에 모이지 않았다`);
}

export async function globalIlluminationAlgorithm(ctx: FacetContext<GlobalIlluminationData>): Promise<void> {
  const rctx = ctx as ReactiveContext<GlobalIlluminationData>;
  const data = narrowGlobalIllumination(ctx.data);
  const shown = new Map<string, number>();
  /** 계기는 누적 채널 — 지금 보이는 값을 쥐고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다 */
  const setMetric = (name: string, value: number) => {
    const before = shown.get(name);
    if (before !== undefined && before === value) return;
    ctx.metric(name, before === undefined ? value : value - before);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let rho = data.initialRho;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = computeGlobalIllumination(data, rho);
      await ctx.emit({
        type: 'init',
        silent: true,
        payload: {
          rho,
          tolerance: data.tolerance,
          chart: { bounces: data.chart.bounces, light: data.chart.light },
          probe: data.probe,
          patches: data.patches.map((p) => ({
            id: p.id,
            kind: p.kind,
            ax: p.a[0],
            ay: p.a[1],
            bx: p.b[0],
            by: p.b[1],
            emitter: data.emitters.includes(p.id),
          })),
          formFactors: run.formFactors,
          light: run.emitted,
          floorMean: run.floorMean0,
        },
      });
      setMetric('bounces', 0);
      setMetric('floor-red', 0);
      // 판 머리 운동(앞 판 막대가 E 로 줄어듦)이 끝날 때까지 첫 걸음을 미룬다
      if (!(await rctx.sleep(data.stepMs + GLOBAL_ILLUMINATION_MOTION_MS))) return;

      for (let s = 0; s < run.steps.length; s += 1) {
        if (ctx.cancelled) return;
        const step = run.steps[s];
        if (s > 0 && !(await rctx.sleep(data.stepMs))) return;
        await phase('bounce');
        await ctx.emit({
          type: 'bounce',
          payload: {
            bounce: step.bounce,
            light: step.light,
            added: step.added,
            accumulated: step.accumulated,
            floorMean: step.floorMean,
            probeRgb: step.probeRgb,
            bleed: step.bleed,
          },
        });
      }
      if (!(await rctx.sleep(data.stepMs))) return;
      const last = run.steps[run.steps.length - 1];
      await phase('converged');
      await ctx.emit({
        type: 'converged',
        payload: {
          bounce: last.bounce,
          added: last.added,
          accumulated: last.accumulated,
          tolerance: data.tolerance,
          limit: data.tolerance * last.accumulated,
        },
      });
      setMetric('bounces', run.converged);
      setMetric('floor-red', run.floorRed);

      // 입력 대기 — 우리 것이 아닌 type 만 흘린다. 제 type 인데 값이 어긋나면 던진다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'reflectance') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) fail('reflectance 입력에 payload 가 없다');
        const value = (payload as Record<string, unknown>).value;
        if (typeof value !== 'number' || !data.rhos.includes(value)) fail(`reflectance 값 ${String(value)} 가 사다리에 없다`);
        rho = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
