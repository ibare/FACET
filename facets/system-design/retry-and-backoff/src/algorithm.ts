/**
 * 재시도와 백오프 — 죽었다 살아난 서버에 손님이 **다시 오는 법**이 몰림을 만든다.
 *
 * 모형 (틱은 정수 시각 · 망 지연 0 · 포기 없음)
 *   - 서버는 틱 outageFrom 부터 장애 길이만큼 죽는다 — 죽은 구간 [outageFrom, outageFrom + 장애 − 1],
 *     되살아나는 틱 = outageFrom + 장애. 살아 있는 틱에는 cap 명까지 받는다.
 *   - 손님: 틱 burstTick 에 무리 burst 명, 틱 0..steadyUntil 에 틱마다 steady 명. 번호 = 온 차례
 *     (같은 틱이면 무리가 먼저). 식별자 c1..cN.
 *   - 한 틱: 그 틱에 찾아온 손님을 처음 온 틱 → 번호 차례로 세운다 (번호 = 온 차례라 번호 차례와 같다).
 *     죽은 틱이면 모두 실패, 살아 있으면 앞의 cap 명을 받고 나머지는 실패.
 *     동률은 번호가 앞선 손님이 이긴다 — 이 데이터에서 살아난 뒤 cap 을 넘는 틱마다 걸린다.
 *   - 실패한 손님은 실패 수 k 를 하나 올리고 다음 찾아올 틱 = 지금 + 기다림.
 *     창 = 2^min(k, kMax). 곧바로(0) 기다림 1 · 지수(1) 기다림 = 창 · 흩음(2) 기다림 = 1 + floor(x·창 / 65537).
 *   - 생성기 x ← (75·x + 74) mod 65537, 씨앗 seed. 판 머리에서 손님 차례 · k 차례로 N × kMax 개를
 *     미리 뽑는다 — draws[c·kMax + k − 1] 가 손님 c(0 부터)의 k 번째 실패에 쓰는 x.
 *     손잡이를 돌려도 손님마다의 뽑기는 같다.
 *
 * 이벤트
 *   - `init` (silent) — 판 머리. 걸음 0 을 갈아 끼운다.
 *       { policy: number, policyId: string, outageFrom: number, outageTo: number, reviveTick: number,
 *         cap: number, motionMs: number, axisLastTick: number, axisMaxStack: number }
 *       axisLastTick · axisMaxStack 는 모든 손잡이 조합에서 셈한 마지막 틱 · 한 틱의 가장 큰 찾아옴.
 *   - `phase` (silent) — { phase }. 걸음마다 발신 바로 앞에 하나.
 *   - `tick` — 누군가 찾아오는 틱 하나 = 걸음 하나.
 *       { tick: number, up: boolean, arrivals: number, served: number, failed: number,
 *         visits: { id: string, fresh: boolean, served: boolean, next: number | null, wait: number | null }[] }
 *       visits 는 세운 차례. served 면 next · wait 는 null, 실패면 다음 찾아올 틱과 기다림.
 *
 * phase 어휘 (irs.ts 와 같다)
 *   `serve` — 그 틱에 실패가 없다
 *   `retry-now` · `retry-exp` · `retry-jitter` — 그 틱에 실패가 있고 방식이 곧바로 · 지수 · 흩음
 *
 * 계기 (판마다 0 에서 다시 센다)
 *   `peak-after`  되살아나는 틱부터 한 틱에 찾아온 가장 큰 수
 *   `fails-after` 되살아나는 틱부터의 실패 합
 *   `last-served` 마지막으로 받은 틱
 *   `attempts`    모든 찾아옴
 *
 * 손잡이
 *   `policy` — 0 곧바로 · 1 지수 · 2 지수+흩음 (policyLadder)
 *   `outage` — 장애 길이 1..5 틱 (outageLadder)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RetryAndBackoffData = {
  type: 'retry-and-backoff';
  stepMs: number;
  motionMs: number;
  cap: number;
  outageFrom: number;
  burstTick: number;
  burst: number;
  steady: number;
  steadyUntil: number;
  kMax: number;
  seed: number;
  tickLimit: number;
  /** 방식 식별자 — 색인이 손잡이 값 */
  policyIds: string[];
  policyLadder: number[];
  outageLadder: number[];
  policy: number;
  outage: number;
};

export type RetryVisit = {
  id: string;
  fresh: boolean;
  served: boolean;
  next: number | null;
  wait: number | null;
};

export type RetryTick = {
  tick: number;
  up: boolean;
  arrivals: number;
  served: number;
  failed: number;
  visits: RetryVisit[];
};

export type RetryTally = {
  peakAfter: number;
  failsAfter: number;
  lastServed: number;
  attempts: number;
};

export type RetryRun = { steps: RetryTick[]; tally: RetryTally };

const MOD = 65537;

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

function readInt(o: Record<string, unknown>, key: string, min: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new Error(`retry-and-backoff: ${key} 가 ${min} 이상의 정수가 아니다 (${String(v)})`);
  }
  return v;
}

/** ctx.data · 무대의 initialData 를 같은 좁히개로 받는다. 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function narrowRetryData(raw: unknown): RetryAndBackoffData {
  if (typeof raw !== 'object' || raw === null) throw new Error('retry-and-backoff: 데이터가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'retry-and-backoff') throw new Error(`retry-and-backoff: type 이 다르다 (${String(o.type)})`);
  const policyIds = o.policyIds;
  if (!Array.isArray(policyIds) || !policyIds.every((x) => typeof x === 'string')) {
    throw new Error('retry-and-backoff: policyIds 가 문자열 목록이 아니다');
  }
  const policyLadder = o.policyLadder;
  const outageLadder = o.outageLadder;
  if (!isIntArray(policyLadder) || policyLadder.length === 0) throw new Error('retry-and-backoff: policyLadder 가 없다');
  if (!isIntArray(outageLadder) || outageLadder.length === 0) throw new Error('retry-and-backoff: outageLadder 가 없다');
  policyLadder.forEach((p, i) => {
    if (p !== i) throw new Error(`retry-and-backoff: policyLadder[${i}] 는 ${i} 여야 한다 (${p})`);
  });
  if (policyLadder.length !== policyIds.length) {
    throw new Error('retry-and-backoff: policyLadder 와 policyIds 의 길이가 다르다');
  }
  const d: RetryAndBackoffData = {
    type: 'retry-and-backoff',
    stepMs: readInt(o, 'stepMs', 1),
    motionMs: readInt(o, 'motionMs', 1),
    cap: readInt(o, 'cap', 1),
    outageFrom: readInt(o, 'outageFrom', 0),
    burstTick: readInt(o, 'burstTick', 0),
    burst: readInt(o, 'burst', 0),
    steady: readInt(o, 'steady', 0),
    steadyUntil: readInt(o, 'steadyUntil', 0),
    kMax: readInt(o, 'kMax', 1),
    seed: readInt(o, 'seed', 0),
    tickLimit: readInt(o, 'tickLimit', 1),
    policyIds: policyIds as string[],
    policyLadder,
    outageLadder,
    policy: readInt(o, 'policy', 0),
    outage: readInt(o, 'outage', 1),
  };
  if (!outageLadder.every((x) => x >= 1)) throw new Error('retry-and-backoff: 장애 길이는 1 이상이다');
  if (!policyLadder.includes(d.policy)) throw new Error(`retry-and-backoff: 기본 방식 ${d.policy} 가 사다리에 없다`);
  if (!outageLadder.includes(d.outage)) throw new Error(`retry-and-backoff: 기본 장애 ${d.outage} 가 사다리에 없다`);
  return d;
}

/** 손님마다 처음 온 틱 — 번호 차례. 같은 틱이면 무리가 먼저, 새 손님이 뒤. */
export function buildBirths(d: RetryAndBackoffData): number[] {
  const births: number[] = [];
  const lastTick = Math.max(d.burstTick, d.steadyUntil);
  for (let tick = 0; tick <= lastTick; tick++) {
    if (tick === d.burstTick) for (let i = 0; i < d.burst; i++) births.push(tick);
    if (tick <= d.steadyUntil) for (let i = 0; i < d.steady; i++) births.push(tick);
  }
  if (births.length === 0) throw new Error('retry-and-backoff: 손님이 없다');
  return births;
}

/** 뽑기 표 — 먼저 x 를 넘기고 그 x 를 쓴다. 손님 차례 · k 차례. */
export function buildDraws(seed: number, customers: number, kMax: number): number[] {
  const draws: number[] = [];
  let x = seed;
  for (let i = 0; i < customers * kMax; i++) {
    x = (75 * x + 74) % MOD;
    draws.push(x);
  }
  return draws;
}

/** 한 판을 끝까지 셈한다 — 누군가 찾아오는 틱만 걸음으로 남긴다. */
export function simulateRetries(
  d: RetryAndBackoffData,
  births: number[],
  draws: number[],
  policy: number,
  outageLen: number,
): RetryRun {
  const n = births.length;
  if (draws.length !== n * d.kMax) throw new Error('retry-and-backoff: 뽑기 표의 길이가 손님 수와 맞지 않는다');
  const deadTo = d.outageFrom + outageLen - 1;
  const revive = deadTo + 1;
  const due = births.slice();
  const tries = new Array<number>(n).fill(0);
  const done = new Array<boolean>(n).fill(false);
  let remaining = n;
  const steps: RetryTick[] = [];
  const tally: RetryTally = { peakAfter: 0, failsAfter: 0, lastServed: 0, attempts: 0 };
  for (let tick = 0; tick < d.tickLimit; tick++) {
    const up = !(tick >= d.outageFrom && tick <= deadTo);
    const visits: RetryVisit[] = [];
    let taken = 0;
    for (let c = 0; c < n; c++) {
      if (done[c] || due[c] !== tick) continue;
      const fresh = tries[c] === 0;
      const id = `c${c + 1}`;
      if (up && taken < d.cap) {
        taken += 1;
        done[c] = true;
        remaining -= 1;
        tally.lastServed = tick;
        visits.push({ id, fresh, served: true, next: null, wait: null });
        continue;
      }
      if (tick >= revive) tally.failsAfter += 1;
      tries[c] += 1;
      const k = Math.min(tries[c], d.kMax);
      let windowSize = 1;
      for (let i = 0; i < k; i++) windowSize *= 2;
      let wait: number;
      if (policy === 0) wait = 1;
      else if (policy === 1) wait = windowSize;
      else if (policy === 2) wait = 1 + Math.floor((draws[c * d.kMax + k - 1] * windowSize) / MOD);
      else throw new Error(`retry-and-backoff: 모르는 방식 ${policy}`);
      due[c] = tick + wait;
      visits.push({ id, fresh, served: false, next: tick + wait, wait });
    }
    if (taken > d.cap) throw new Error(`retry-and-backoff: 틱 ${tick} 에 감당 ${d.cap} 보다 많이 받았다`);
    const arrivals = visits.length;
    tally.attempts += arrivals;
    if (tick >= revive) tally.peakAfter = Math.max(tally.peakAfter, arrivals);
    if (arrivals > 0) {
      steps.push({ tick, up, arrivals, served: taken, failed: arrivals - taken, visits });
    }
    if (remaining === 0) return { steps, tally };
  }
  throw new Error(`retry-and-backoff: 틱 ${d.tickLimit} 안에 손님 ${remaining} 명을 받지 못했다`);
}

/** 모든 손잡이 조합에서 축 범위 — 마지막 틱과 한 틱의 가장 큰 찾아옴. */
export function scanAxis(d: RetryAndBackoffData, births: number[], draws: number[]): { lastTick: number; maxStack: number } {
  let lastTick = 0;
  let maxStack = 0;
  for (const policy of d.policyLadder) {
    for (const outage of d.outageLadder) {
      const run = simulateRetries(d, births, draws, policy, outage);
      lastTick = Math.max(lastTick, run.tally.lastServed);
      for (const s of run.steps) maxStack = Math.max(maxStack, s.arrivals);
    }
  }
  return { lastTick, maxStack };
}

/** 걸음의 phase — 실패가 있으면 방식의 가지, 없으면 serve. */
export function phaseOf(step: RetryTick, policy: number): 'serve' | 'retry-now' | 'retry-exp' | 'retry-jitter' {
  if (step.failed === 0) return 'serve';
  if (policy === 0) return 'retry-now';
  if (policy === 1) return 'retry-exp';
  if (policy === 2) return 'retry-jitter';
  throw new Error(`retry-and-backoff: 모르는 방식 ${policy}`);
}

type MetricName = 'peak-after' | 'fails-after' | 'last-served' | 'attempts';

export async function retryAndBackoffAlgorithm(ctx: FacetContext<RetryAndBackoffData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RetryAndBackoffData>;
  const data = narrowRetryData(ctx.data);
  const births = buildBirths(data);
  const draws = buildDraws(data.seed, births.length, data.kMax);
  const axis = scanAxis(data, births, draws);

  const shown: Record<MetricName, number> = { 'peak-after': 0, 'fails-after': 0, 'last-served': 0, attempts: 0 };
  const setMetric = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let policy = data.policy;
  let outage = data.outage;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = simulateRetries(data, births, draws, policy, outage);
      const policyId = data.policyIds[policy];
      if (policyId === undefined) throw new Error(`retry-and-backoff: 방식 ${policy} 의 식별자가 없다`);
      const revive = data.outageFrom + outage;

      setMetric('peak-after', 0);
      setMetric('fails-after', 0);
      setMetric('last-served', 0);
      setMetric('attempts', 0);
      await ctx.emit({
        type: 'init',
        payload: {
          policy,
          policyId,
          outageFrom: data.outageFrom,
          outageTo: revive - 1,
          reviveTick: revive,
          cap: data.cap,
          motionMs: data.motionMs,
          axisLastTick: axis.lastTick,
          axisMaxStack: axis.maxStack,
        },
        silent: true,
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      let peak = 0;
      let failsAfter = 0;
      let last = 0;
      let attempts = 0;
      for (const step of run.steps) {
        if (ctx.cancelled) return;
        const ph = phaseOf(step, policy);
        if (ph === 'serve') await phase('serve');
        else if (ph === 'retry-now') await phase('retry-now');
        else if (ph === 'retry-exp') await phase('retry-exp');
        else await phase('retry-jitter');
        await ctx.emit({ type: 'tick', payload: step });
        attempts += step.arrivals;
        if (step.tick >= revive) {
          peak = Math.max(peak, step.arrivals);
          failsAfter += step.failed;
        }
        if (step.served > 0) last = step.tick;
        setMetric('peak-after', peak);
        setMetric('fails-after', failsAfter);
        setMetric('last-served', last);
        setMetric('attempts', attempts);
        if (!(await rctx.sleep(data.stepMs + data.motionMs))) return;
      }
      if (peak !== run.tally.peakAfter || failsAfter !== run.tally.failsAfter
        || last !== run.tally.lastServed || attempts !== run.tally.attempts) {
        throw new Error('retry-and-backoff: 걸음을 따라 센 계기와 판의 셈이 다르다');
      }

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'policy' && input.type !== 'outage') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) {
          throw new Error(`retry-and-backoff: ${input.type} 입력에 payload 가 없다`);
        }
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') throw new Error(`retry-and-backoff: ${input.type} 값이 수가 아니다`);
        if (input.type === 'policy') {
          if (!data.policyLadder.includes(value)) throw new Error(`retry-and-backoff: 방식 ${value} 가 사다리에 없다`);
          policy = value;
        } else {
          if (!data.outageLadder.includes(value)) throw new Error(`retry-and-backoff: 장애 ${value} 가 사다리에 없다`);
          outage = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
