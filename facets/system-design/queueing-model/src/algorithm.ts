/**
 * queueing-model — 서버 하나 · 먼저 온 차례 대기열에서 요청 마흔이 도착하고 처리된다.
 *
 * 주장: 기다림은 부하만으로 생기지 않는다 — 들쭉날쭉함이 만든다. 같은 ρ 에서 간격 · 처리가 고르면
 * 아무도 기다리지 않고, 들쭉날쭉할수록 기다린 요청과 기다림이 는다.
 *
 * 시각은 "단위 시간"(처리 평균 1) 의 double 이다. 틱이 아니다.
 *
 * ── 뽑기 (IR 밖)
 *   x ← (75·x + 74) mod 65537, 씨앗 `seed`. u = x / 65537. 요청마다 u 둘 — 먼저 간격, 다음 처리.
 *   손잡이 값이 달라도 u 열은 같다 (한 번 뽑아 두고 모든 판이 쓴다).
 *   모양: 고름(0) = 평균 · 반쯤(1) = 평균 × (0.5 + u) · 지수(2) = −ln(1 − u) × 평균.
 *   간격 평균 = 100 / load (ρ = load / 100), 처리 평균 = serviceMean.
 *
 * ── 셈 (IR `settle` 과 같은 길)
 *   도착 = 간격을 차례로 더한 것. 기다림은 Lindley 점화식 w_0 = 0, w_i = max(0, w_{i−1} + 처리_{i−1} − 간격_i).
 *   시작 = 도착 + 기다림, 떠남 = 시작 + 처리. "기다렸다" = w > 0 (정확히 0 과 견준다).
 *   줄 = 요청 i 가 도착한 때 앞선 요청 가운데 아직 시작하지 않은 수 (도착_j + 기다림_j > 도착_i).
 *   처리 중인 하나는 세지 않는다. 줄 한도 없음.
 *   동률: 서버가 하나라 고를 일이 없다. 같은 시각 도착은 번호 차례 — 이 데이터에서는 걸리지 않는다
 *   (씨앗 42 의 u 열에 0 이 없어 간격이 0 인 요청이 없다. test 가 센다).
 *
 * ── 이벤트
 *   init     (silent) { variability, load, axisEnd, waitTop, lineTop,
 *                       requests: { id, arrive, service }[] }
 *            axisEnd = 사다리 전체(모든 들쭉날쭉 × 모든 ρ)의 가장 늦은 떠남, waitTop = 사다리 전체의 가장 긴 기다림,
 *            lineTop = 사다리 전체의 가장 긴 줄. 손잡이를 돌려도 축이 그대로라 점이 옮겨 간다.
 *   request  { index, id, arrive, service, wait, start, depart, line, busy }
 *            index 는 0 부터. busy = 도착한 때 서버가 처리 중이었다 (= wait > 0).
 *   sum-up   { variability, load, meanWait, maxWait, waited, longestLine }
 *   phase    (silent) { phase }
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   serve-now     기다림 0 인 요청 걸음
 *   wait-in-line  기다림 > 0 인 요청 걸음
 *   sum-up        모아 셈 걸음
 *
 * ── 계기
 *   waited        지금까지 기다린 요청 수 (w > 0)
 *   longest-line  지금까지 한 요청이 도착한 때 본 줄의 최대
 *   판 머리에서 0 으로, 걸음마다 지금 값을 들고 차이만 보낸다 (차이 0 도 보낸다).
 *
 * ── 걸음
 *   걸음 0 = init · 걸음 1..40 = 요청 하나씩(도착 차례) · 걸음 41 = 모아 셈. 걸음마다 stepMs + motionMs 쉰다.
 *   init 뒤에도 한 번 쉰다 — 점이 옮겨 가는 운동이 첫 요청에 끊기지 않게.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type QueueingModelData = {
  type: 'queueing-model';
  stepMs: number;
  motionMs: number;
  requests: number;
  serviceMean: number;
  seed: number;
  variabilities: number[];
  loads: number[];
  variability: number;
  load: number;
};

/** 한 판의 셈 결과 — 요청마다 같은 차례. */
export type QueueingRun = {
  gap: number[];
  service: number[];
  arrive: number[];
  wait: number[];
  start: number[];
  depart: number[];
  line: number[];
  waited: number;
  meanWait: number;
  maxWait: number;
  longestLine: number;
};

const LCG_M = 65537;

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** ctx.data 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function readQueueingModelData(raw: unknown): QueueingModelData {
  if (typeof raw !== 'object' || raw === null) throw new Error('queueing-model: 데이터가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'queueing-model') throw new Error(`queueing-model: type 이 다르다 (${String(d.type)})`);
  const nums = ['stepMs', 'motionMs', 'requests', 'serviceMean', 'seed', 'variability', 'load'] as const;
  for (const k of nums) {
    if (typeof d[k] !== 'number' || !Number.isFinite(d[k])) throw new Error(`queueing-model: ${k} 가 수가 아니다`);
  }
  if (!isNumberArray(d.variabilities) || d.variabilities.length === 0) {
    throw new Error('queueing-model: variabilities 가 수 배열이 아니다');
  }
  if (!isNumberArray(d.loads) || d.loads.length === 0) throw new Error('queueing-model: loads 가 수 배열이 아니다');
  const data = d as unknown as QueueingModelData;
  if (!Number.isInteger(data.requests) || data.requests < 1) throw new Error('queueing-model: requests 가 양의 정수가 아니다');
  if (!Number.isInteger(data.seed) || data.seed < 0 || data.seed >= LCG_M) throw new Error('queueing-model: seed 가 범위 밖');
  for (const v of data.variabilities) {
    if (v !== 0 && v !== 1 && v !== 2) throw new Error(`queueing-model: 모르는 들쭉날쭉 ${v}`);
  }
  for (const l of data.loads) {
    if (!Number.isInteger(l) || l <= 0 || l >= 100) throw new Error(`queueing-model: 부하 ${l} 는 1..99 정수여야 한다 (ρ < 1)`);
  }
  if (!data.variabilities.includes(data.variability)) throw new Error('queueing-model: 기본 들쭉날쭉이 사다리에 없다');
  if (!data.loads.includes(data.load)) throw new Error('queueing-model: 기본 부하가 사다리에 없다');
  return data;
}

/** 요청마다 u 둘 (간격, 처리). 손잡이와 무관하게 한 번 뽑는다. */
export function drawUniforms(n: number, seed: number): Array<[number, number]> {
  let x = seed;
  const next = (): number => {
    x = (75 * x + 74) % LCG_M;
    return x / LCG_M;
  };
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const ug = next();
    const us = next();
    out.push([ug, us]);
  }
  return out;
}

function shape(variability: number, u: number, mean: number): number {
  switch (variability) {
    case 0:
      return mean;
    case 1:
      return mean * (0.5 + u);
    case 2:
      return -Math.log(1 - u) * mean;
    default:
      throw new Error(`queueing-model: 모르는 들쭉날쭉 ${variability}`);
  }
}

/** 간격 · 처리 배열 — IR 에 건네는 입력. */
export function sampleInputs(
  data: QueueingModelData,
  uniforms: Array<[number, number]>,
  variability: number,
  load: number,
): { gap: number[]; service: number[] } {
  const gapMean = 100 / load;
  const gap: number[] = [];
  const service: number[] = [];
  for (const [ug, us] of uniforms) {
    gap.push(shape(variability, ug, gapMean));
    service.push(shape(variability, us, data.serviceMean));
  }
  return { gap, service };
}

/** Lindley 점화식으로 한 판을 센다 (IR `settle` 과 같은 식 · 같은 차례). */
export function settleRun(gap: number[], service: number[]): QueueingRun {
  const n = gap.length;
  if (service.length !== n) throw new Error('queueing-model: 간격과 처리의 길이가 다르다');
  const arrive: number[] = [];
  const wait: number[] = [];
  const start: number[] = [];
  const depart: number[] = [];
  const line: number[] = [];
  let at = 0;
  let w = 0;
  let waited = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    at += gap[i]!;
    if (i > 0) {
      // max(0, …) 를 IR 과 같게 줄여 쓴 꼴 — 음수면 0 으로 자른다
      w = w + service[i - 1]! - gap[i]!;
      if (w < 0) w = 0;
    }
    if (w > 0) waited += 1;
    const wi = w > 0 ? w : 0;
    arrive.push(at);
    wait.push(wi);
    start.push(at + wi);
    depart.push(at + wi + service[i]!);
    total += wi;
    let count = 0;
    for (let j = 0; j < i; j += 1) {
      if (arrive[j]! + wait[j]! > at) count += 1;
    }
    line.push(count);
  }
  return {
    gap,
    service,
    arrive,
    wait,
    start,
    depart,
    line,
    waited,
    meanWait: total / n,
    maxWait: Math.max(...wait),
    longestLine: Math.max(...line),
  };
}

/** 사다리 전체의 축 범위 — 손잡이를 돌려도 그대로다. */
export function ladderAxes(
  data: QueueingModelData,
  uniforms: Array<[number, number]>,
): { axisEnd: number; waitTop: number; lineTop: number } {
  let axisEnd = 0;
  let waitTop = 0;
  let lineTop = 0;
  for (const v of data.variabilities) {
    for (const l of data.loads) {
      const { gap, service } = sampleInputs(data, uniforms, v, l);
      const run = settleRun(gap, service);
      axisEnd = Math.max(axisEnd, run.depart[run.depart.length - 1]!);
      waitTop = Math.max(waitTop, run.maxWait);
      lineTop = Math.max(lineTop, run.longestLine);
    }
  }
  return { axisEnd, waitTop, lineTop };
}

type MetricName = 'waited' | 'longest-line';

export async function queueingModelAlgorithm(base: FacetContext<QueueingModelData>): Promise<void> {
  const ctx = base as ReactiveContext<QueueingModelData>;
  const data = readQueueingModelData(ctx.data);
  const uniforms = drawUniforms(data.requests, data.seed);
  const axes = ladderAxes(data, uniforms);
  let variability = data.variability;
  let load = data.load;

  const shown: Record<MetricName, number> = { waited: 0, 'longest-line': 0 };
  const setMetric = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(data.stepMs + data.motionMs);

  /** 한 판을 끝까지 돈다. 취소되면 false. */
  const playRound = async (): Promise<boolean> => {
    const { gap, service } = sampleInputs(data, uniforms, variability, load);
    const run = settleRun(gap, service);
    setMetric('waited', 0);
    setMetric('longest-line', 0);
    await ctx.emit({
      type: 'init',
      silent: true,
      payload: {
        variability,
        load,
        axisEnd: axes.axisEnd,
        waitTop: axes.waitTop,
        lineTop: axes.lineTop,
        requests: run.arrive.map((arrive, i) => ({ id: `q${i + 1}`, arrive, service: run.service[i]! })),
      },
    });
    // 점이 새 도착 시각으로 옮겨 가는 운동이 끝난 뒤 첫 요청으로 간다 — 경계가 없으면 첫 요청이 운동을 끊는다
    if (!(await pause())) return false;
    let waitedSoFar = 0;
    let longestSoFar = 0;
    for (let i = 0; i < run.arrive.length; i += 1) {
      if (ctx.cancelled) return false;
      const wait = run.wait[i]!;
      const line = run.line[i]!;
      if (wait > 0) {
        await phase('wait-in-line');
        waitedSoFar += 1;
      } else {
        await phase('serve-now');
      }
      longestSoFar = Math.max(longestSoFar, line);
      await ctx.emit({
        type: 'request',
        payload: {
          index: i,
          id: `q${i + 1}`,
          arrive: run.arrive[i]!,
          service: run.service[i]!,
          wait,
          start: run.start[i]!,
          depart: run.depart[i]!,
          line,
          busy: wait > 0,
        },
      });
      setMetric('waited', waitedSoFar);
      setMetric('longest-line', longestSoFar);
      if (!(await pause())) return false;
    }
    if (ctx.cancelled) return false;
    if (waitedSoFar !== run.waited || longestSoFar !== run.longestLine) {
      throw new Error('queueing-model: 걸음마다 센 수와 모아 센 수가 다르다');
    }
    await phase('sum-up');
    await ctx.emit({
      type: 'sum-up',
      payload: {
        variability,
        load,
        meanWait: run.meanWait,
        maxWait: run.maxWait,
        waited: run.waited,
        longestLine: run.longestLine,
      },
    });
    setMetric('waited', run.waited);
    setMetric('longest-line', run.longestLine);
    return pause();
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload as { value?: unknown } | undefined;
        const value = payload?.value;
        if (input.type === 'variability') {
          if (typeof value !== 'number' || !data.variabilities.includes(value)) continue;
          variability = value;
          break;
        }
        if (input.type === 'load') {
          if (typeof value !== 'number' || !data.loads.includes(value)) continue;
          load = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
