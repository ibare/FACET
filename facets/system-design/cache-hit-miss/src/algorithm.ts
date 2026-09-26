/**
 * cache-hit-miss — 캐시 적중과 실패 (cache-aside 읽기).
 *
 * 요청이 온 차례대로 하나씩 캐시에 닿는다. 키가 캐시에 있으면 거기서 돌아서고(적중,
 * 캐시 보기 ms), 없으면 DB 까지 더 가서 값을 가져와 돌아오는 길에 캐시에 그 키를 남긴다
 * (실패, 캐시 보기 + DB 읽기 ms). 캐시에 넣는 시간은 0. 교체와 만료는 없다 — 용량을
 * 넘치면 던진다. 걸린 ms 가 쌓여 누계가 된다.
 *
 * 이벤트
 *   init     (silent) 걸음 0 을 갈아 끼운다. 셈으로 나오는 출발점과 누계 축의 끝.
 *            payload { cache: string[]; total: number; hits: number; misses: number; axisMs: number }
 *              cache  — 처음 캐시에 든 키 (이 데이터에서는 빔)
 *              axisMs — 끝 누계 ms. 누계 띠의 축척으로만 쓴다
 *   request  요청 하나. 캐시에 닿고 → 돌아서거나 DB 에 다녀오고 → 누계에 ms 가 붙는다.
 *            payload { index: number; key: string; kind: 'hit' | 'miss'; ms: number;
 *                      slot: number; cache: string[]; total: number; hits: number; misses: number }
 *              index — 요청 차례 (0 부터)
 *              slot  — 적중이면 키를 찾은 칸, 실패면 키를 남긴 칸
 *              cache — 이 요청 뒤 캐시에 든 키 (든 차례대로)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CacheHitMissFacetData = {
  type: 'cache-hit-miss';
  stepMs: number;
  /** 온 차례대로 요청한 키 */
  requests: string[];
  /** 캐시 보기 ms */
  cacheMs: number;
  /** DB 읽기 ms */
  dbMs: number;
  /** 캐시가 들 수 있는 키의 수 */
  capacity: number;
};

export type RequestKind = 'hit' | 'miss';

export type RequestOutcome = {
  index: number;
  key: string;
  kind: RequestKind;
  ms: number;
  slot: number;
  cache: string[];
  total: number;
  hits: number;
  misses: number;
};

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`cache-hit-miss: ${path} 는 양의 정수여야 한다 (${String(v)})`);
  }
  return v;
}

/** `initialData` 좁히개 — 모양이 어긋나면 던진다. 알고리즘 · 장면 · 그림이 함께 쓴다. */
export function narrowCacheHitMissData(raw: unknown): CacheHitMissFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('cache-hit-miss: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'cache-hit-miss') throw new Error(`cache-hit-miss: initialData.type 이 다르다 (${String(r.type)})`);
  const stepMs = positiveInt(r.stepMs, 'initialData.stepMs');
  const cacheMs = positiveInt(r.cacheMs, 'initialData.cacheMs');
  const dbMs = positiveInt(r.dbMs, 'initialData.dbMs');
  const capacity = positiveInt(r.capacity, 'initialData.capacity');
  if (!Array.isArray(r.requests) || r.requests.length === 0) {
    throw new Error('cache-hit-miss: initialData.requests 는 비지 않은 배열이어야 한다');
  }
  const requests = r.requests.map((k, i) => {
    if (typeof k !== 'string' || k.length === 0) throw new Error(`cache-hit-miss: initialData.requests[${i}] 가 키가 아니다`);
    return k;
  });
  return { type: 'cache-hit-miss', stepMs, requests, cacheMs, dbMs, capacity };
}

/** 요청을 차례로 캐시에 보내 요청마다의 결과를 셈한다. 캐시가 넘치면 던진다. */
export function runRequests(data: CacheHitMissFacetData): RequestOutcome[] {
  const cache: string[] = [];
  const out: RequestOutcome[] = [];
  let total = 0;
  let hits = 0;
  let misses = 0;
  for (let index = 0; index < data.requests.length; index += 1) {
    const key = data.requests[index] as string;
    const found = cache.indexOf(key);
    let kind: RequestKind;
    let ms: number;
    let slot: number;
    if (found >= 0) {
      kind = 'hit';
      ms = data.cacheMs;
      slot = found;
      hits += 1;
    } else {
      if (cache.length >= data.capacity) {
        throw new Error(`cache-hit-miss: requests[${index}] 에서 캐시가 넘친다 (용량 ${data.capacity}) — 이 조각은 교체를 그리지 않는다`);
      }
      kind = 'miss';
      ms = data.cacheMs + data.dbMs;
      cache.push(key);
      slot = cache.length - 1;
      misses += 1;
    }
    total += ms;
    out.push({ index, key, kind, ms, slot, cache: [...cache], total, hits, misses });
  }
  return out;
}

export async function cacheHitMiss(ctx0: FacetContext<CacheHitMissFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<CacheHitMissFacetData>;
  const data = narrowCacheHitMissData(ctx.data);
  const outcomes = runRequests(data);
  const last = outcomes[outcomes.length - 1];
  if (!last) throw new Error('cache-hit-miss: 요청이 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { cache: [], total: 0, hits: 0, misses: 0, axisMs: last.total },
  });

  for (const o of outcomes) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'request',
      payload: {
        index: o.index,
        key: o.key,
        kind: o.kind,
        ms: o.ms,
        slot: o.slot,
        cache: o.cache,
        total: o.total,
        hits: o.hits,
        misses: o.misses,
      },
    });
  }
}
