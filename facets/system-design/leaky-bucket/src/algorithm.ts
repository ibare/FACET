/**
 * 누출 버킷(대기열 꼴) — 몰려 들어온 요청이 통에서 차례를 기다리다 같은 간격으로 흘러나간다.
 *
 * 규약
 * - 시각의 단위는 초, 정수 초에만 일이 일어난다. 걸음 하나 = 1 초, 걸음 0 = 시각 0.
 * - 같은 초의 차례: (1) 그 초에 온 요청이 데이터 차례대로 통에 든다 — 통이 용량만큼 차 있으면 버린다
 *   (2) `leakEvery` 로 나누어떨어지는 초면 통 머리(먼저 든 것) 하나가 흘러나간다. 비었으면 아무것도 나가지 않는다.
 * - 흘림 시계는 통이 비어도 돌아간다. 모든 요청이 도착했고 통이 빈 초에서 멈춘다.
 *
 * 이벤트 (발신 차례대로)
 * - `init` (silent) — 셈으로 정해지는 바탕.
 *     payload: { lastSec: number; arrivalGaps: Array<{ id: string; gap: number | null }> }
 *     lastSec      통이 비고 더 올 요청이 없는 마지막 초 (시간 축의 끝)
 *     arrivalGaps  데이터 차례의 요청마다 바로 앞 요청과의 도착 간격(초). 첫 요청은 null
 * - `second` — 한 초에 일어난 일. 시각 0 의 것만 silent 로 보내 걸음 0 을 채운다.
 *     payload: {
 *       sec: number;            이 초
 *       came: string[];         이 초에 온 요청 (온 차례)
 *       dropped: string[];      그중 통이 차서 버린 것
 *       afterIn: string[];      들어옴을 마친 뒤 통 (머리가 앞)
 *       out: string | null;     흘러나간 요청
 *       gap: number | null;     바로 앞에 흘러나간 요청과의 간격(초). 첫 흘림이거나 흘림이 없으면 null
 *       bucket: string[];       이 초를 마친 뒤 통 (머리가 앞)
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LeakyRequest = { id: string; at: number };

export type LeakyBucketFacetData = {
  type: 'leaky-bucket';
  stepMs: number;
  /** 통(대기열) 용량 */
  capacity: number;
  /** 이 수로 나누어떨어지는 초마다 하나를 흘린다 */
  leakEvery: number;
  /** 데이터 차례 = 온 차례. 도착 시각이 줄지 않는다 */
  requests: LeakyRequest[];
};

export type LeakySecond = {
  sec: number;
  came: string[];
  dropped: string[];
  afterIn: string[];
  out: string | null;
  gap: number | null;
  bucket: string[];
};

export type LeakyRun = {
  rows: LeakySecond[];
  lastSec: number;
  arrivalGaps: Array<{ id: string; gap: number | null }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`leaky-bucket: ${path} 는 양의 정수여야 한다 (${String(v)})`);
  }
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 쓴다. 어긋나면 던진다. */
export function narrowLeakyBucketData(raw: unknown): LeakyBucketFacetData {
  if (!isRecord(raw)) throw new Error('leaky-bucket: 자료가 객체가 아니다');
  if (raw.type !== 'leaky-bucket') throw new Error(`leaky-bucket: type 이 다르다 (${String(raw.type)})`);
  const stepMs = positiveInt(raw.stepMs, 'stepMs');
  const capacity = positiveInt(raw.capacity, 'capacity');
  const leakEvery = positiveInt(raw.leakEvery, 'leakEvery');
  if (!Array.isArray(raw.requests) || raw.requests.length === 0) {
    throw new Error('leaky-bucket: requests 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const requests: LeakyRequest[] = raw.requests.map((r: unknown, i: number) => {
    if (!isRecord(r)) throw new Error(`leaky-bucket: requests[${i}] 가 객체가 아니다`);
    if (typeof r.id !== 'string' || r.id === '') throw new Error(`leaky-bucket: requests[${i}].id 가 문자열이 아니다`);
    if (seen.has(r.id)) throw new Error(`leaky-bucket: requests[${i}].id 가 겹친다 (${r.id})`);
    seen.add(r.id);
    if (typeof r.at !== 'number' || !Number.isInteger(r.at) || r.at < 0) {
      throw new Error(`leaky-bucket: requests[${i}].at 은 0 이상의 정수여야 한다`);
    }
    return { id: r.id, at: r.at };
  });
  for (let i = 1; i < requests.length; i += 1) {
    if (requests[i].at < requests[i - 1].at) {
      throw new Error(`leaky-bucket: requests[${i}].at 이 앞 요청보다 이르다 — 데이터 차례가 온 차례여야 한다`);
    }
  }
  return { type: 'leaky-bucket', stepMs, capacity, leakEvery, requests };
}

/** 이 초가 흘리는 초인가. 바탕(leakEvery)에서 정해지는 작은 셈이라 그림도 이것을 부른다. */
export function isLeakSecond(sec: number, leakEvery: number): boolean {
  return sec % leakEvery === 0;
}

/** 초마다 통을 셈한다. 모든 요청이 도착하고 통이 빈 초에서 멈춘다. */
export function leakRows(data: LeakyBucketFacetData): LeakyRun {
  const { capacity, leakEvery, requests } = data;
  const lastArrival = requests[requests.length - 1].at;
  // 통은 용량을 넘지 않으니 마지막 도착 뒤 용량 × 간격 + 간격 안에 반드시 빈다
  const bound = lastArrival + (capacity + 1) * leakEvery;
  const rows: LeakySecond[] = [];
  let bucket: string[] = [];
  let next = 0;
  let lastOut: number | null = null;
  for (let sec = 0; ; sec += 1) {
    if (sec > bound) throw new Error(`leaky-bucket: ${bound} 초가 지나도 통이 비지 않는다`);
    const came: string[] = [];
    const dropped: string[] = [];
    while (next < requests.length && requests[next].at === sec) {
      const id = requests[next].id;
      came.push(id);
      if (bucket.length < capacity) bucket = [...bucket, id];
      else dropped.push(id);
      next += 1;
    }
    const afterIn = bucket;
    let out: string | null = null;
    let gap: number | null = null;
    if (isLeakSecond(sec, leakEvery) && bucket.length > 0) {
      out = bucket[0];
      bucket = bucket.slice(1);
      gap = lastOut === null ? null : sec - lastOut;
      lastOut = sec;
    }
    rows.push({ sec, came, dropped, afterIn, out, gap, bucket });
    if (next === requests.length && bucket.length === 0) {
      const arrivalGaps = requests.map((r, i) => ({ id: r.id, gap: i === 0 ? null : r.at - requests[i - 1].at }));
      return { rows, lastSec: sec, arrivalGaps };
    }
  }
}

function secondPayload(row: LeakySecond): LeakySecond {
  return {
    sec: row.sec,
    came: [...row.came],
    dropped: [...row.dropped],
    afterIn: [...row.afterIn],
    out: row.out,
    gap: row.gap,
    bucket: [...row.bucket],
  };
}

export async function leakyBucket(ctx: FacetContext<LeakyBucketFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LeakyBucketFacetData>;
  const data = narrowLeakyBucketData(ctx.data);
  const run = leakRows(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { lastSec: run.lastSec, arrivalGaps: run.arrivalGaps.map((g) => ({ ...g })) },
    silent: true,
  });
  const [first, ...rest] = run.rows;
  // 걸음 0 = 시각 0 — 첫 초는 걸음을 늘리지 않고 첫 장면을 채운다
  await ctx.emit({ type: 'second', payload: secondPayload(first), silent: true });
  for (const row of rest) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'second', payload: secondPayload(row) });
  }
}
