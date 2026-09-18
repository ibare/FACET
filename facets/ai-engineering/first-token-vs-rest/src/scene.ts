/**
 * 장면 — 바탕(프롬프트 · 이어짐) · 자취(걸음마다 캐시에 들어간 층) · 이번 걸음.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 걸음이 캐시에 넣은 층. 열의 자리 from .. from+count−1. */
export type CacheLayer = { k: number; from: number; count: number };

export type FirstTokenVsRestStep =
  | { kind: 'feed'; k: number; from: number; count: number; emit: number }
  | { kind: 'done'; total: number };

export type FirstTokenVsRestScene = {
  prompt: readonly string[];
  continuation: readonly string[];
  layers: readonly CacheLayer[];
  /** 지금까지 낸 토큰 수. */
  emitted: number;
  done: boolean;
  step: FirstTokenVsRestStep | null;
};

function words(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string') : [];
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export const firstTokenVsRestScene: ScenePlan<FirstTokenVsRestScene> = {
  initial() {
    return { prompt: [], continuation: [], layers: [], emitted: 0, done: false, step: null };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init':
        return {
          prompt: words(p.prompt),
          continuation: words(p.continuation),
          layers: [],
          emitted: 0,
          done: false,
          step: null,
        };
      case 'feed': {
        const k = num(p.k);
        const from = num(p.from);
        const count = num(p.count);
        const emit = num(p.emit);
        return {
          ...scene,
          layers: [...scene.layers, { k, from, count }],
          emitted: emit + 1,
          step: { kind: 'feed', k, from, count, emit },
        };
      }
      case 'done':
        return { ...scene, done: true, step: { kind: 'done', total: num(p.total) } };
      default:
        return scene;
    }
  },
};
