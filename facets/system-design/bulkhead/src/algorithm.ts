/**
 * 벌크헤드 — 자리(스레드) 여섯을 칸으로 나누면 한쪽의 홍수가 옆을 굶기지 못한다.
 *
 * 손잡이 `aSlots` 는 자리 여섯 가운데 a 칸에 주는 수다 (0 = 나누지 않음, 한 풀).
 * 나누면 a 칸 = 자리 1..aSlots, b 칸 = 나머지. 칸 사이에 자리를 빌려주지 않는다.
 *
 * 한 틱의 차례: ① 쥔 틱이 다 찬 호출이 자리를 놓는다 (끝 틱 ≤ 지금)
 *               ② a 도착 ③ b 도착 — 제 칸의 **앞 번호 빈 자리**를 잡고(끝 틱 = 지금 + 쥐는 틱),
 *               없으면 곧바로 거절한다 (기다리는 줄 없음).
 * 동률 규칙: 빈 자리가 여럿이면 앞 번호가 이긴다. 같은 틱의 도착은 a 먼저, 서비스 안에서는 번호 차례.
 * 이 데이터에서 동률은 매 도착마다 걸린다 — 빈 자리가 둘 이상일 때 늘 앞 번호를 고른다.
 *
 * ── 이벤트 ────────────────────────────────────────────────────────────────
 *   init    (silent)  판 머리. 걸음 0 을 갈아 끼운다.
 *     { aSlots: number, pool: number, ticks: number, motionMs: number,
 *       ranges: { a: { from: number, to: number }, b: { from: number, to: number } }   // 자리 번호 1 부터, 닫힌 구간
 *       services: { id: 'a' | 'b', rate: number, hold: number }[],
 *       seats: Seat[] }                                                                 // 모두 빈 자리
 *   phase   (silent)  { phase: 'free' | 'take' | 'refuse' }  — 걸음 이벤트 바로 앞
 *   release (걸음)    { tick: number, freed: { seat: number, call: string }[], seats: Seat[] }
 *   arrive  (걸음)    { tick: number,
 *                      calls: { call: string, service: 'a' | 'b', seat: number | null }[],   // seat null = 거절
 *                      counts: { aTaken, aRefused, bTaken, bRefused },                         // 이 걸음의 수
 *                      seats: Seat[] }
 *   Seat = { seat: number, call: string | null, service: 'a' | 'b' | null, left: number, hold: number }
 *          left = 끝 틱 − 지금 틱 (남은 쥠), 빈 자리는 0 · 0.
 *
 * ── phase 어휘 (irs.ts 와 같다) ────────────────────────────────────────────
 *   free    놓음 걸음
 *   take    도착 걸음 — 그 틱에 거절이 없을 때
 *   refuse  도착 걸음 — 그 틱에 거절이 하나라도 있을 때
 *
 * ── 계기 (판마다 0 에서 다시 센다) ──────────────────────────────────────────
 *   a-taken · a-refused · b-taken · b-refused
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BulkheadServiceId = 'a' | 'b';

export type BulkheadService = {
  id: BulkheadServiceId;
  /** 틱마다 오는 호출 수 */
  rate: number;
  /** 한 호출이 자리를 쥐는 틱 수 */
  hold: number;
};

export type BulkheadData = {
  type: 'bulkhead';
  stepMs: number;
  /** 걸음 안 운동 길이 (재생 속도 1 에서). 벽시계는 stepMs + motionMs */
  motionMs: number;
  /** 자리(스레드) 수 */
  pool: number;
  /** 틱 0..ticks−1 */
  ticks: number;
  /** 도착 차례대로 — a 먼저, b 다음 */
  services: BulkheadService[];
  /** 손잡이 사다리 — a 칸 크기 (0 = 나누지 않음) */
  ladder: number[];
  /** 처음 판의 a 칸 크기 */
  aSlots: number;
};

export type BulkheadSeat = {
  seat: number;
  call: string | null;
  service: BulkheadServiceId | null;
  left: number;
  hold: number;
};

export type BulkheadRange = { from: number; to: number };

export type BulkheadArrival = { call: string; service: BulkheadServiceId; seat: number | null };

export type BulkheadTally = { aTaken: number; aRefused: number; bTaken: number; bRefused: number };

/** 한 판을 끝까지 셈한 결과 (검사 · 대조용). 걸음 0 은 넣지 않는다 */
export type BulkheadStep =
  | { kind: 'release'; tick: number; freed: { seat: number; call: string }[]; seats: BulkheadSeat[] }
  | {
      kind: 'arrive';
      tick: number;
      calls: BulkheadArrival[];
      counts: BulkheadTally;
      seats: BulkheadSeat[];
    };

export type BulkheadRun = {
  aSlots: number;
  ranges: { a: BulkheadRange; b: BulkheadRange };
  steps: BulkheadStep[];
  totals: BulkheadTally;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function posInt(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) {
    throw new Error(`bulkhead: ${what} 는 0 이상의 정수여야 한다 (받은 값 ${String(x)})`);
  }
  return x;
}

/** ctx.data 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다 */
export function parseBulkheadData(raw: unknown): BulkheadData {
  if (!isRecord(raw)) throw new Error('bulkhead: data 가 객체가 아니다');
  if (raw.type !== 'bulkhead') throw new Error(`bulkhead: data.type 이 bulkhead 가 아니다 (${String(raw.type)})`);
  const stepMs = posInt(raw.stepMs, 'stepMs');
  const motionMs = posInt(raw.motionMs, 'motionMs');
  const pool = posInt(raw.pool, 'pool');
  const ticks = posInt(raw.ticks, 'ticks');
  if (pool < 2) throw new Error('bulkhead: pool 은 2 이상이어야 칸을 나눌 수 있다');
  if (!Array.isArray(raw.services) || raw.services.length !== 2) {
    throw new Error('bulkhead: services 는 a · b 둘이어야 한다');
  }
  const services: BulkheadService[] = raw.services.map((s, i) => {
    if (!isRecord(s)) throw new Error(`bulkhead: services[${i}] 가 객체가 아니다`);
    const want: BulkheadServiceId = i === 0 ? 'a' : 'b';
    if (s.id !== want) throw new Error(`bulkhead: services[${i}].id 는 ${want} 여야 한다 (${String(s.id)})`);
    const hold = posInt(s.hold, `services[${i}].hold`);
    if (hold < 1) throw new Error(`bulkhead: services[${i}].hold 는 1 이상이어야 한다`);
    return { id: want, rate: posInt(s.rate, `services[${i}].rate`), hold };
  });
  if (!Array.isArray(raw.ladder) || raw.ladder.length === 0) throw new Error('bulkhead: ladder 가 비었다');
  const ladder = raw.ladder.map((v, i) => {
    const n = posInt(v, `ladder[${i}]`);
    if (n >= pool) throw new Error(`bulkhead: ladder[${i}] = ${n} 가 자리 수 ${pool} 이상이다`);
    return n;
  });
  const aSlots = posInt(raw.aSlots, 'aSlots');
  if (!ladder.includes(aSlots)) throw new Error(`bulkhead: aSlots ${aSlots} 가 사다리에 없다`);
  return { type: 'bulkhead', stepMs, motionMs, pool, ticks, services, ladder, aSlots };
}

/** a 칸 크기에서 두 칸의 자리 범위 (1 부터, 닫힌 구간). 0 이면 둘 다 한 풀 */
export function bulkheadRanges(aSlots: number, pool: number): { a: BulkheadRange; b: BulkheadRange } {
  if (!Number.isInteger(aSlots) || aSlots < 0 || aSlots >= pool) {
    throw new Error(`bulkhead: a 칸 크기 ${aSlots} 가 0..${pool - 1} 밖이다`);
  }
  if (aSlots === 0) return { a: { from: 1, to: pool }, b: { from: 1, to: pool } };
  return { a: { from: 1, to: aSlots }, b: { from: aSlots + 1, to: pool } };
}

type Held = { call: string; service: BulkheadServiceId; end: number; hold: number };

function snapshot(seats: (Held | null)[], now: number): BulkheadSeat[] {
  return seats.map((h, i) =>
    h === null
      ? { seat: i + 1, call: null, service: null, left: 0, hold: 0 }
      : { seat: i + 1, call: h.call, service: h.service, left: h.end - now, hold: h.hold },
  );
}

/** 한 판을 끝까지 셈한다 — algorithm 이 이 걸음들을 차례로 발신한다 */
export function simulateBulkhead(data: BulkheadData, aSlots: number): BulkheadRun {
  const ranges = bulkheadRanges(aSlots, data.pool);
  const seats: (Held | null)[] = Array.from({ length: data.pool }, () => null);
  const issued: Record<BulkheadServiceId, number> = { a: 0, b: 0 };
  const totals: BulkheadTally = { aTaken: 0, aRefused: 0, bTaken: 0, bRefused: 0 };
  const steps: BulkheadStep[] = [];

  for (let tick = 0; tick < data.ticks; tick += 1) {
    // ① 놓음
    const freed: { seat: number; call: string }[] = [];
    for (let i = 0; i < seats.length; i += 1) {
      const h = seats[i];
      if (h !== null && h !== undefined && h.end <= tick) {
        freed.push({ seat: i + 1, call: h.call });
        seats[i] = null;
      }
    }
    if (freed.length > 0) steps.push({ kind: 'release', tick, freed, seats: snapshot(seats, tick) });

    // ② a 도착 ③ b 도착
    const calls: BulkheadArrival[] = [];
    const counts: BulkheadTally = { aTaken: 0, aRefused: 0, bTaken: 0, bRefused: 0 };
    for (const svc of data.services) {
      const range = ranges[svc.id];
      for (let r = 0; r < svc.rate; r += 1) {
        issued[svc.id] += 1;
        const call = `${svc.id}${issued[svc.id]}`;
        let got: number | null = null;
        for (let s = range.from; s <= range.to; s += 1) {
          if (seats[s - 1] === null) {
            got = s;
            break;
          }
        }
        if (got !== null) {
          seats[got - 1] = { call, service: svc.id, end: tick + svc.hold, hold: svc.hold };
          if (svc.id === 'a') counts.aTaken += 1;
          else counts.bTaken += 1;
        } else if (svc.id === 'a') counts.aRefused += 1;
        else counts.bRefused += 1;
        calls.push({ call, service: svc.id, seat: got });
      }
    }
    // 불변식: 쥔 호출은 모두 제 칸 안의 자리에 있다 (칸 사이 빌려주기 없음)
    for (let i = 0; i < seats.length; i += 1) {
      const h = seats[i];
      if (h === null || h === undefined) continue;
      const own = ranges[h.service];
      if (i + 1 < own.from || i + 1 > own.to) {
        throw new Error(`bulkhead: ${h.call} 가 제 칸(${own.from}–${own.to}) 밖의 자리 ${i + 1} 를 쥐었다`);
      }
    }
    totals.aTaken += counts.aTaken;
    totals.aRefused += counts.aRefused;
    totals.bTaken += counts.bTaken;
    totals.bRefused += counts.bRefused;
    steps.push({ kind: 'arrive', tick, calls, counts, seats: snapshot(seats, tick) });
  }
  return { aSlots, ranges, steps, totals };
}

export async function bulkheadAlgorithm(rawCtx: FacetContext<BulkheadData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<BulkheadData>;
  const data = parseBulkheadData(ctx.data);
  const wall = data.stepMs + data.motionMs;

  const shown: Record<string, number> = {};
  /** 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 도 보낸다 */
  const setMetric = (name: string, value: number): void => {
    const prev = shown[name];
    if (prev === undefined) {
      ctx.metric(name, value);
      shown[name] = value;
    } else if (prev !== value) {
      ctx.metric(name, value - prev);
      shown[name] = value;
    }
  };

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판을 재생한다. 취소되면 false */
  const playRun = async (aSlots: number): Promise<boolean> => {
    const run = simulateBulkhead(data, aSlots);
    const running: BulkheadTally = { aTaken: 0, aRefused: 0, bTaken: 0, bRefused: 0 };
    await ctx.emit({
      type: 'init',
      payload: {
        aSlots,
        pool: data.pool,
        ticks: data.ticks,
        motionMs: data.motionMs,
        ranges: run.ranges,
        services: data.services.map((s) => ({ id: s.id, rate: s.rate, hold: s.hold })),
        seats: snapshot(Array.from({ length: data.pool }, () => null), 0),
      },
      silent: true,
    });
    setMetric('a-taken', 0);
    setMetric('a-refused', 0);
    setMetric('b-taken', 0);
    setMetric('b-refused', 0);
    if (!(await ctx.sleep(wall))) return false;

    for (const step of run.steps) {
      if (ctx.cancelled) return false;
      if (step.kind === 'release') {
        await phase('free');
        await ctx.emit({
          type: 'release',
          payload: { tick: step.tick, freed: step.freed, seats: step.seats },
        });
      } else {
        const refused = step.counts.aRefused + step.counts.bRefused;
        if (refused > 0) await phase('refuse');
        else await phase('take');
        await ctx.emit({
          type: 'arrive',
          payload: { tick: step.tick, calls: step.calls, counts: step.counts, seats: step.seats },
        });
        running.aTaken += step.counts.aTaken;
        running.aRefused += step.counts.aRefused;
        running.bTaken += step.counts.bTaken;
        running.bRefused += step.counts.bRefused;
        setMetric('a-taken', running.aTaken);
        setMetric('a-refused', running.aRefused);
        setMetric('b-taken', running.bTaken);
        setMetric('b-refused', running.bRefused);
      }
      if (!(await ctx.sleep(wall))) return false;
    }
    return true;
  };

  try {
    let aSlots = data.aSlots;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun(aSlots))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'aSlots') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number' || !data.ladder.includes(value)) continue;
        aSlots = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
