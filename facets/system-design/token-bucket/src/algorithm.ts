/**
 * token-bucket — 쌓아 둔 만큼은 한꺼번에 쓴다.
 *
 * 통 용량만큼 토큰이 쌓일 수 있고, 1 초마다 `refillPerSecond` 개가 채워진다 (가득이면
 * 넘친 것은 버린다). 그 초에 온 요청은 온 차례대로 토큰 하나씩 쓰고 지나간다. 토큰이
 * 없으면 거절한다 — 기다리게 하지 않는다. 걸음 하나 = 1 초.
 *
 * 같은 초의 차례: (1) 채움 (2) 그 초의 요청. 시각 0 은 시작이라 채우지 않는다.
 *
 * 이벤트
 *   init  (silent)  { sec: 0, tokens: number, lastSec: number }
 *                   시각 0 의 통 안 토큰 수와 마지막 초. 걸음 0 을 세운다.
 *   tick            { sec: number,
 *                     from: number,        채우기 전 토큰 수 (앞 초의 남은 토큰)
 *                     added: number,       통에 들어간 토큰 수
 *                     overflowed: number,  가득이라 버린 토큰 수
 *                     before: number,      채운 뒤 · 요청 전 토큰 수
 *                     arrived: number,     그 초에 온 요청 수
 *                     passed: number,      토큰을 쓰고 지나간 수
 *                     rejected: number,    토큰이 없어 거절된 수
 *                     after: number,       그 초 끝의 토큰 수
 *                     spilledTotal: number, rejectedTotal: number, passedTotal: number }  (누적)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TokenBucketArrival = { at: number; count: number };

export type TokenBucketFacetData = {
  type: 'token-bucket';
  stepMs: number;
  capacity: number;
  refillPerSecond: number;
  startTokens: number;
  arrivals: TokenBucketArrival[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function intAtLeast(v: unknown, min: number, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new Error(`token-bucket: ${path} 는 ${min} 이상의 정수여야 한다 (받은 값: ${String(v)})`);
  }
  return v;
}

/** 자료 좁히개 — 모양이 어긋나면 던진다. 알고리즘 · 장면이 같이 부른다. */
export function narrowTokenBucketData(raw: unknown): TokenBucketFacetData {
  if (!isRecord(raw)) throw new Error('token-bucket: 자료가 객체가 아니다');
  if (raw.type !== 'token-bucket') throw new Error(`token-bucket: type 이 다르다 (${String(raw.type)})`);
  const stepMs = intAtLeast(raw.stepMs, 1, 'stepMs');
  const capacity = intAtLeast(raw.capacity, 1, 'capacity');
  const refillPerSecond = intAtLeast(raw.refillPerSecond, 1, 'refillPerSecond');
  const startTokens = intAtLeast(raw.startTokens, 0, 'startTokens');
  if (startTokens > capacity) throw new Error('token-bucket: startTokens 가 capacity 를 넘는다');
  if (!Array.isArray(raw.arrivals) || raw.arrivals.length === 0) {
    throw new Error('token-bucket: arrivals 는 비지 않은 배열이어야 한다');
  }
  const arrivals: TokenBucketArrival[] = [];
  raw.arrivals.forEach((a, i) => {
    if (!isRecord(a)) throw new Error(`token-bucket: arrivals[${i}] 가 객체가 아니다`);
    // 시각 0 은 시작 — 채우지 않는 초라 요청을 두지 않는다
    const at = intAtLeast(a.at, 1, `arrivals[${i}].at`);
    const count = intAtLeast(a.count, 1, `arrivals[${i}].count`);
    const prev = arrivals[arrivals.length - 1];
    if (prev !== undefined && at <= prev.at) {
      throw new Error(`token-bucket: arrivals[${i}].at 은 앞 항목보다 커야 한다`);
    }
    arrivals.push({ at, count });
  });
  return { type: 'token-bucket', stepMs, capacity, refillPerSecond, startTokens, arrivals };
}

/** 마지막 초 — 마지막 요청이 온 초. 바탕에서 정해지는 작은 셈이라 장면도 부른다. */
export function lastSecond(data: TokenBucketFacetData): number {
  const last = data.arrivals[data.arrivals.length - 1];
  if (last === undefined) throw new Error('token-bucket: arrivals 가 비었다');
  return last.at;
}

function arrivalsAt(data: TokenBucketFacetData, sec: number): number {
  const hit = data.arrivals.find((a) => a.at === sec);
  return hit === undefined ? 0 : hit.count;
}

export async function tokenBucket(ctx: FacetContext<TokenBucketFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<TokenBucketFacetData>;
  const data = narrowTokenBucketData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const lastSec = lastSecond(data);
  let tokens = data.startTokens;
  let spilledTotal = 0;
  let rejectedTotal = 0;
  let passedTotal = 0;

  await rctx.emit({ type: 'init', silent: true, payload: { sec: 0, tokens, lastSec } });

  for (let sec = 1; sec <= lastSec; sec += 1) {
    // 걸음 0(시각 0) 도 읽을 것이 있는 화면이라 첫 초 앞에도 문을 둔다
    if (!(await pause())) return;

    const from = tokens;
    const room = data.capacity - tokens;
    const added = Math.min(room, data.refillPerSecond);
    const overflowed = data.refillPerSecond - added;
    tokens += added;
    const before = tokens;

    const arrived = arrivalsAt(data, sec);
    const passed = Math.min(arrived, tokens);
    const rejected = arrived - passed;
    tokens -= passed;

    spilledTotal += overflowed;
    rejectedTotal += rejected;
    passedTotal += passed;

    await rctx.emit({
      type: 'tick',
      payload: {
        sec,
        from,
        added,
        overflowed,
        before,
        arrived,
        passed,
        rejected,
        after: tokens,
        spilledTotal,
        rejectedTotal,
        passedTotal,
      },
    });
  }
}
