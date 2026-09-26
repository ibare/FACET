/**
 * 레이트 리미팅 — 같은 "평균 틱당 1 · 몰림 b" 한도의 네 모양.
 *
 * 한 요청 줄(`arrivals` — 틱마다 온 수)을 네 제한기 중 하나에 흘려 보내고, 지나간 요청이
 * 뒤쪽 서버 시간 축의 어느 틱에 떨어지는지 센다. 손잡이는 제한 방식(0 고정 창 · 1 미는 창 ·
 * 2 토큰 버킷 · 3 누출 버킷)과 몰림 허용 b(2 · 3 · 4 · 6)다.
 *
 * ── 규약
 * - 시각은 틱(정수). 한 틱 안의 차례: 토큰 채움(틱 > 0, b 를 넘지 않게) → 그 틱의 도착을 번호
 *   차례로 판정 → 누출은 통 머리 하나를 흘린다.
 * - 고정 창: 칸 = floor(틱 / b), 칸마다 b 건. 미는 창(로그 꼴): (틱 − b, 틱] 안에서 앞서 받은 수 < b.
 *   토큰 버킷: 용량 b, 가득 차서 시작, 틱 > 0 마다 1 채움, 요청 하나 = 토큰 하나.
 *   누출 버킷(대기열 꼴): 통 = 먼저 온 차례의 줄, 한도 b(흘리기 **전** 통 안 수로 본다), 틱마다 머리 하나.
 * - 평균 한도는 틱당 1 이다 — IR 이 채움 · 흘림을 1 로 적으므로 `rate` 가 1 이 아니면 던진다.
 * - 동률: 같은 틱의 도착끼리는 번호 차례. 이 제한기들에는 "누가 이기나" 를 가를 동률이 따로 없다 —
 *   판정 순서가 번호 차례라는 것이 전부이고, 몰림(틱 0 · 11 · 12)에서 늘 걸린다.
 *   b 틱 구간 최대의 자리는 가장 이른 시작 틱을 고른다 (같은 최대가 여럿일 때).
 * - 시간 축 끝은 사다리 전체(방식 넷 × b 넷)에서 가장 늦게 지나간 틱이다. 모든 판이 틱 0..축 끝을 걷는다.
 *
 * ── 이벤트
 * - `init` (silent) — 판 머리. payload `{ method: number, burst: number, axisEnd: number,
 *   maxStack: number, maxBurst: number, startFill: number, arriveTick: number[] }`.
 *   startFill 은 틱 0 앞의 제한기 칸(토큰 버킷은 가득 = b, 나머지는 0).
 *   maxStack 은 사다리 전체에서 한 틱에 가장 많이 지나간 수 · 한 틱에 가장 많이 온 수 중 큰 것.
 * - `phase` (silent) — `{ phase: string }`. 그 걸음의 발신 바로 앞.
 * - `tick` (걸음) — 틱 하나. payload `{ tick: number, arrived: number[], passed: number[],
 *   rejected: number[], queued: number[], bucket: number[], fill: number,
 *   window: { start: number, end: number } | null, peakStart: number }`.
 *   passed 는 이 틱에 서버에 닿은 요청 번호(닿은 차례), queued 는 이 틱에 통에 들어가 아직 남은 번호,
 *   bucket 은 틱 끝의 통(머리부터), fill 은 제한기 칸이 찬 수(창 안 받은 수 · 토큰 · 통 안 수),
 *   window 는 창 둘의 지금 창(끝 포함, 시작은 0 에서 자른다), 나머지 방식은 null. peakStart 는 지금까지의 b 틱 구간 최대가
 *   처음 나온 구간의 시작 틱.
 *
 * ── phase 어휘 (irs.ts 와 같다)
 * `fixed-window` · `sliding-window` · `take-token` · `leak-out` · `reject` · `next-tick`.
 * 걸음의 phase: 그 틱에 거절이 있으면 reject, 아니면 지나간 것이 있으면 방식의 phase, 아니면 next-tick.
 *
 * ── 계기 (그 틱까지의 지금 값을 들고 차이만 보낸다. 판 머리 0)
 * `passed` 지나감 · `rejected` 거절 · `peak-tick` 한 틱 최대 · `peak-window` b 틱 구간 최대 ·
 * `wait-total` 기다림 합(지나간 틱 − 도착 틱).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RateLimitingData = {
  type: 'rate-limiting';
  stepMs: number;
  /** 틱마다 온 요청 수 (틱 0 부터) */
  arrivals: number[];
  /** 평균 한도 — 틱당 몇 건 */
  rate: number;
  /** 제한 방식 사다리 (0 고정 창 · 1 미는 창 · 2 토큰 버킷 · 3 누출 버킷) */
  methods: number[];
  /** 몰림 허용 b 사다리 */
  bursts: number[];
  /** 첫 판의 방식 · b */
  method: number;
  burst: number;
};

export const METHOD_FIXED = 0;
export const METHOD_SLIDING = 1;
export const METHOD_TOKEN = 2;
export const METHOD_LEAKY = 3;

/** 운동 길이(ms, 속도 1). 걸음은 운동이 끝난 뒤 stepMs 만큼 쉰다. */
export const MOTION_MS = 300;

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** `ctx.data` · 무대의 initialData 를 모양 검사해 좁힌다. 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function readRateLimitingData(raw: unknown): RateLimitingData {
  if (typeof raw !== 'object' || raw === null) throw new Error('rate-limiting: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'rate-limiting') throw new Error(`rate-limiting: type 이 다르다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('rate-limiting: stepMs 가 양수가 아니다');
  if (!isIntArray(d.arrivals) || d.arrivals.length === 0 || d.arrivals.some((x) => x < 0)) {
    throw new Error('rate-limiting: arrivals 는 음수 아닌 정수 배열이어야 한다');
  }
  if (d.rate !== 1) throw new Error(`rate-limiting: 평균 한도는 틱당 1 만 셈한다 (rate ${String(d.rate)})`);
  if (!isIntArray(d.methods) || d.methods.length === 0) throw new Error('rate-limiting: methods 사다리가 없다');
  for (const m of d.methods) {
    if (m < METHOD_FIXED || m > METHOD_LEAKY) throw new Error(`rate-limiting: 모르는 방식 ${m}`);
  }
  if (!isIntArray(d.bursts) || d.bursts.length === 0 || d.bursts.some((b) => b < 1)) {
    throw new Error('rate-limiting: bursts 사다리는 1 이상 정수여야 한다');
  }
  if (typeof d.method !== 'number' || !d.methods.includes(d.method)) {
    throw new Error(`rate-limiting: 첫 방식 ${String(d.method)} 이 사다리에 없다`);
  }
  if (typeof d.burst !== 'number' || !d.bursts.includes(d.burst)) {
    throw new Error(`rate-limiting: 첫 b ${String(d.burst)} 가 사다리에 없다`);
  }
  return {
    type: 'rate-limiting',
    stepMs: d.stepMs,
    arrivals: [...d.arrivals],
    rate: 1,
    methods: [...d.methods],
    bursts: [...d.bursts],
    method: d.method,
    burst: d.burst,
  };
}

/** 틱마다 온 수를 요청마다의 도착 틱(오름차순)으로 편다. 요청 번호 = 색인. */
export function expandArrivals(arrivals: readonly number[]): number[] {
  const out: number[] = [];
  arrivals.forEach((count, tick) => {
    for (let k = 0; k < count; k += 1) out.push(tick);
  });
  return out;
}

export type TickRecord = {
  tick: number;
  arrived: number[];
  passed: number[];
  rejected: number[];
  queued: number[];
  bucket: number[];
  fill: number;
  window: { start: number; end: number } | null;
};

export type LimitResult = {
  /** 요청마다 지나간 틱, 거절 −1 */
  passTick: number[];
  ticks: TickRecord[];
};

/**
 * 제한기를 틱 0..lastTick 로 돌린다. IR `limitRequests` 와 같은 셈이다.
 * lastTick 이 null 이면 모든 도착이 판정되고 통이 빌 때까지 걷는다(축 끝을 셈할 때).
 */
export function limitRequests(
  method: number,
  burst: number,
  arriveTick: readonly number[],
  lastTick: number | null,
): LimitResult {
  if (method !== METHOD_FIXED && method !== METHOD_SLIDING && method !== METHOD_TOKEN && method !== METHOD_LEAKY) {
    throw new Error(`rate-limiting: 모르는 방식 ${method}`);
  }
  if (!Number.isInteger(burst) || burst < 1) throw new Error(`rate-limiting: b 가 1 이상 정수가 아니다 (${burst})`);
  const n = arriveTick.length;
  const passTick: number[] = new Array<number>(n).fill(-1);
  const judged: boolean[] = new Array<boolean>(n).fill(false);
  const accepted: number[] = [];
  const bucket: number[] = [];
  const ticks: TickRecord[] = [];
  let tokens = burst;
  let i = 0;
  for (let tick = 0; lastTick === null ? i < n || bucket.length > 0 : tick <= lastTick; tick += 1) {
    if (tick > 0 && tokens < burst) tokens += 1;
    const arrived: number[] = [];
    const passed: number[] = [];
    const rejected: number[] = [];
    const queued: number[] = [];
    while (i < n && arriveTick[i] === tick) {
      arrived.push(i);
      let ok = false;
      if (method === METHOD_FIXED) {
        const used = accepted.filter((a) => Math.floor(a / burst) === Math.floor(tick / burst)).length;
        ok = used < burst;
      } else if (method === METHOD_SLIDING) {
        const used = accepted.filter((a) => a > tick - burst).length;
        ok = used < burst;
      } else if (method === METHOD_TOKEN) {
        if (tokens > 0) {
          tokens -= 1;
          ok = true;
        }
      } else {
        if (bucket.length < burst) {
          bucket.push(i);
          queued.push(i);
          ok = true;
        }
      }
      judged[i] = true;
      if (ok) {
        if (method === METHOD_FIXED || method === METHOD_SLIDING) accepted.push(tick);
        if (method !== METHOD_LEAKY) {
          passTick[i] = tick;
          passed.push(i);
        }
      } else {
        rejected.push(i);
      }
      i += 1;
    }
    if (i < n && arriveTick[i] < tick) throw new Error(`rate-limiting: 도착 틱이 오름차순이 아니다 (r${i})`);
    if (method === METHOD_LEAKY) {
      const head = bucket.shift();
      if (head !== undefined) {
        passTick[head] = tick;
        passed.push(head);
        const qi = queued.indexOf(head);
        if (qi >= 0) queued.splice(qi, 1);
      }
      if (bucket.length > burst) throw new Error(`rate-limiting: 통 안 ${bucket.length} 이 b ${burst} 를 넘었다`);
    }
    if (tokens < 0 || tokens > burst) throw new Error(`rate-limiting: 토큰 ${tokens} 이 0..b 밖이다`);
    let fill: number;
    let window: { start: number; end: number } | null = null;
    if (method === METHOD_FIXED) {
      const start = Math.floor(tick / burst) * burst;
      window = { start, end: start + burst - 1 };
      fill = accepted.filter((a) => a >= start && a <= start + burst - 1).length;
    } else if (method === METHOD_SLIDING) {
      // 틱 0 앞은 비어 있으니 창의 시작을 0 에서 자른다 (보이는 틀과 캡션이 음수 틱을 말하지 않게)
      window = { start: Math.max(0, tick - burst + 1), end: tick };
      fill = accepted.filter((a) => a > tick - burst && a <= tick).length;
    } else if (method === METHOD_TOKEN) {
      fill = tokens;
    } else {
      fill = bucket.length;
    }
    if (fill > burst) throw new Error(`rate-limiting: 틱 ${tick} 의 칸 ${fill} 이 b ${burst} 를 넘었다`);
    ticks.push({ tick, arrived, passed, rejected, queued, bucket: [...bucket], fill, window });
  }
  if (i < n) throw new Error(`rate-limiting: 틱 ${lastTick} 까지 판정되지 않은 요청이 있다 (r${i})`);
  if (bucket.length > 0) throw new Error(`rate-limiting: 틱 ${lastTick} 에 통이 비지 않았다 (${bucket.length})`);
  if (judged.some((j) => !j)) throw new Error('rate-limiting: 판정되지 않은 요청이 있다');
  return { passTick, ticks };
}

export type Tally = {
  passed: number;
  rejected: number;
  peakTick: number;
  peakWindow: number;
  /** b 틱 구간 최대가 처음 나온 구간의 시작 틱 */
  peakStart: number;
  waitTotal: number;
};

/**
 * 틱 uptoTick 까지 지나간 것으로 계기 다섯을 센다. 판정된 거절만 거절로 센다.
 * b 틱 구간 [s, s + b) 는 s = 0 .. uptoTick 을 본다 — 틱 0 앞은 비어 있어 s < 0 인 구간은 [0, b) 를
 * 넘지 못한다. 같은 최대면 이른 s.
 */
export function tally(
  passTick: readonly number[],
  arriveTick: readonly number[],
  burst: number,
  uptoTick: number,
): Tally {
  const perTick = new Array<number>(uptoTick + 1).fill(0);
  let passed = 0;
  let rejected = 0;
  let waitTotal = 0;
  passTick.forEach((p, r) => {
    const a = arriveTick[r];
    if (a === undefined) throw new Error(`rate-limiting: r${r} 의 도착 틱이 없다`);
    if (p >= 0 && p <= uptoTick) {
      passed += 1;
      perTick[p] = (perTick[p] as number) + 1;
      waitTotal += p - a;
    } else if (p < 0 && a <= uptoTick) {
      rejected += 1;
    }
  });
  const peakTick = Math.max(0, ...perTick);
  let peakWindow = 0;
  let peakStart = 0;
  for (let s = 0; s <= uptoTick; s += 1) {
    let sum = 0;
    for (let k = Math.max(0, s); k < s + burst && k <= uptoTick; k += 1) {
      const c = perTick[k];
      if (c === undefined) throw new Error(`rate-limiting: 틱 ${k} 의 지나간 수가 없다`);
      sum += c;
    }
    if (sum > peakWindow) {
      peakWindow = sum;
      peakStart = s;
    }
  }
  return { passed, rejected, peakTick, peakWindow, peakStart, waitTotal };
}

export type Bounds = { axisEnd: number; maxStack: number; maxBurst: number };

/** 사다리 전체에서 축 끝 · 가장 높은 쌓임 · 가장 큰 b 를 셈한다 — 손잡이를 돌려도 축이 그대로이게. */
export function ladderBounds(data: RateLimitingData, arriveTick: readonly number[]): Bounds {
  let axisEnd = data.arrivals.length - 1;
  let maxStack = Math.max(...data.arrivals);
  for (const m of data.methods) {
    for (const b of data.bursts) {
      const { passTick, ticks } = limitRequests(m, b, arriveTick, null);
      for (const p of passTick) if (p > axisEnd) axisEnd = p;
      for (const rec of ticks) if (rec.passed.length > maxStack) maxStack = rec.passed.length;
    }
  }
  return { axisEnd, maxStack, maxBurst: Math.max(...data.bursts) };
}

function phaseOf(method: number, rec: TickRecord): string {
  if (rec.rejected.length > 0) return 'reject';
  if (rec.passed.length === 0) return 'next-tick';
  if (method === METHOD_FIXED) return 'fixed-window';
  if (method === METHOD_SLIDING) return 'sliding-window';
  if (method === METHOD_TOKEN) return 'take-token';
  if (method === METHOD_LEAKY) return 'leak-out';
  throw new Error(`rate-limiting: 모르는 방식 ${method}`);
}

type MetricName = 'passed' | 'rejected' | 'peak-tick' | 'peak-window' | 'wait-total';

export async function rateLimitingAlgorithm(context: FacetContext<RateLimitingData>): Promise<void> {
  const ctx = context as ReactiveContext<RateLimitingData>;
  const data = readRateLimitingData(ctx.data);
  const arriveTick = expandArrivals(data.arrivals);
  const bounds = ladderBounds(data, arriveTick);
  let method = data.method;
  let burst = data.burst;

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<MetricName, number>();
  const setMetric = (name: MetricName, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined || prev !== value) ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (): Promise<boolean> => {
    const { passTick, ticks } = limitRequests(method, burst, arriveTick, bounds.axisEnd);
    setMetric('passed', 0);
    setMetric('rejected', 0);
    setMetric('peak-tick', 0);
    setMetric('peak-window', 0);
    setMetric('wait-total', 0);
    await ctx.emit({
      type: 'init',
      payload: {
        method,
        burst,
        axisEnd: bounds.axisEnd,
        maxStack: bounds.maxStack,
        maxBurst: bounds.maxBurst,
        startFill: method === METHOD_TOKEN ? burst : 0,
        arriveTick: [...arriveTick],
      },
      silent: true,
    });
    for (const rec of ticks) {
      if (ctx.cancelled) return false;
      const now = tally(passTick, arriveTick, burst, rec.tick);
      const name = phaseOf(method, rec);
      if (name === 'reject') await phase('reject');
      else if (name === 'fixed-window') await phase('fixed-window');
      else if (name === 'sliding-window') await phase('sliding-window');
      else if (name === 'take-token') await phase('take-token');
      else if (name === 'leak-out') await phase('leak-out');
      else await phase('next-tick');
      await ctx.emit({
        type: 'tick',
        payload: {
          tick: rec.tick,
          arrived: rec.arrived,
          passed: rec.passed,
          rejected: rec.rejected,
          queued: rec.queued,
          bucket: rec.bucket,
          fill: rec.fill,
          window: rec.window,
          peakStart: now.peakStart,
        },
      });
      setMetric('passed', now.passed);
      setMetric('rejected', now.rejected);
      setMetric('peak-tick', now.peakTick);
      setMetric('peak-window', now.peakWindow);
      setMetric('wait-total', now.waitTotal);
      if (!(await ctx.sleep(data.stepMs + MOTION_MS))) return false;
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun())) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘리고, 값은 사다리 소속을 확인하고 받는다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p: unknown = input.payload;
        const value: unknown = typeof p === 'object' && p !== null && 'value' in p ? p.value : undefined;
        if (input.type === 'method') {
          if (typeof value !== 'number' || !data.methods.includes(value)) {
            throw new Error(`rate-limiting: 방식 값 ${String(value)} 이 사다리에 없다`);
          }
          method = value;
          break;
        }
        if (input.type === 'burst') {
          if (typeof value !== 'number' || !data.bursts.includes(value)) {
            throw new Error(`rate-limiting: b 값 ${String(value)} 이 사다리에 없다`);
          }
          burst = value;
          break;
        }
        continue;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
