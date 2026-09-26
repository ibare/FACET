/**
 * cache-hit-miss 장면 — 이벤트를 잇기만 한다. 적중/실패 판정과 ms · 누계는 알고리즘이 싣는다.
 *
 * 바탕  requests · capacity (initialData 에서 베낀다) · axisMs (silent init)
 * 자취  done (끝난 요청마다 종류와 ms) · cache (든 키) · total · hits · misses
 * 이번  step — 방금 끝난 요청 (돌아선 곳 · 찾거나 남긴 칸)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowCacheHitMissData, type RequestKind } from './algorithm.js';

export type DoneRequest = { key: string; kind: RequestKind; ms: number };

export type CacheHitMissRun = {
  axisMs: number;
  cache: string[];
  done: DoneRequest[];
  total: number;
  hits: number;
  misses: number;
};

export type CacheHitMissStep = { index: number; key: string; kind: RequestKind; ms: number; slot: number };

export type CacheHitMissScene = {
  requests: string[];
  capacity: number;
  /** silent init 전에는 null — 셈으로 나올 값을 지어 넣지 않는다 */
  run: CacheHitMissRun | null;
  step: CacheHitMissStep | null;
};

function fail(msg: string): never {
  throw new Error(`cacheHitMissScene: ${msg}`);
}

function num(p: Record<string, unknown>, name: string, type: string): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${name} 가 수가 아니다`);
  return v;
}

function keys(p: Record<string, unknown>, name: string, type: string): string[] {
  const v = p[name];
  if (!Array.isArray(v)) fail(`${type}.payload.${name} 가 배열이 아니다`);
  return v.map((k, i) => {
    if (typeof k !== 'string') fail(`${type}.payload.${name}[${i}] 가 키가 아니다`);
    return k;
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 없다`);
  return p as Record<string, unknown>;
}

export const cacheHitMissScene: ScenePlan<CacheHitMissScene> = {
  initial(initialData: unknown): CacheHitMissScene {
    const d = narrowCacheHitMissData(initialData);
    return { requests: [...d.requests], capacity: d.capacity, run: null, step: null };
  },

  reduce(scene: CacheHitMissScene, event: FacetRuntimeEvent): CacheHitMissScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const cache = keys(p, 'cache', 'init');
        if (cache.length > scene.capacity) fail('init.payload.cache 가 용량을 넘는다');
        return {
          ...scene,
          run: {
            axisMs: num(p, 'axisMs', 'init'),
            cache,
            done: [],
            total: num(p, 'total', 'init'),
            hits: num(p, 'hits', 'init'),
            misses: num(p, 'misses', 'init'),
          },
          step: null,
        };
      }
      case 'request': {
        const run = scene.run;
        if (!run) fail('request 가 init 보다 먼저 왔다');
        const p = payloadOf(event);
        const index = num(p, 'index', 'request');
        const key = p.key;
        const kind = p.kind;
        if (typeof key !== 'string') fail('request.payload.key 가 키가 아니다');
        if (kind !== 'hit' && kind !== 'miss') fail(`request.payload.kind 를 모른다 (${String(kind)})`);
        if (index !== run.done.length) fail(`request.payload.index 가 차례와 다르다 (${index} ≠ ${run.done.length})`);
        if (scene.requests[index] !== key) fail(`request.payload.key 가 requests[${index}] 와 다르다`);
        const ms = num(p, 'ms', 'request');
        const slot = num(p, 'slot', 'request');
        const cache = keys(p, 'cache', 'request');
        if (cache.length > scene.capacity) fail('request.payload.cache 가 용량을 넘는다');
        if (cache[slot] !== key) fail(`request.payload.slot 칸에 ${key} 없음`);
        if (kind === 'hit') {
          if (cache.length !== run.cache.length || cache.some((k, i) => run.cache[i] !== k)) {
            fail('request.payload.cache — 적중이 캐시를 바꿨다');
          }
        } else if (
          cache.length !== run.cache.length + 1 ||
          run.cache.some((k, i) => cache[i] !== k) ||
          slot !== run.cache.length
        ) {
          fail('request.payload.cache — 실패가 키 하나를 끝 칸에 남기지 않았다');
        }
        return {
          ...scene,
          run: {
            axisMs: run.axisMs,
            cache,
            done: [...run.done, { key, kind, ms }],
            total: num(p, 'total', 'request'),
            hits: num(p, 'hits', 'request'),
            misses: num(p, 'misses', 'request'),
          },
          step: { index, key, kind, ms, slot },
        };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
