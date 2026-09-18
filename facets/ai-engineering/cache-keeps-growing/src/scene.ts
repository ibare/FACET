/**
 * 장면 — 바탕(모형 구성 · 자리 하나의 바이트 · 한도)과 자취(쌓인 층)와 이번 걸음.
 *
 * 쌓인 것은 줄지 않는다 — 자취는 덧붙기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CacheBase = {
  layers: number;
  kvHeads: number;
  headDim: number;
  valueBytes: number;
  perPosition: number;
  limit: number;
};

/** 한 걸음이 얹은 켜. from 자리에서 to 자리까지. bytes 는 to 자리까지의 누적. */
export type CacheLayer = { from: number; to: number; bytes: number; perPosition: number };

export type CacheStep = { kind: 'grow'; from: number; to: number };

export type CacheScene = {
  base: CacheBase | null;
  stack: CacheLayer[];
  step: CacheStep | null;
};

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  return typeof v === 'number' ? v : 0;
}

function record(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

export const cacheKeepsGrowingScene: ScenePlan<CacheScene> = {
  initial(): CacheScene {
    return { base: null, stack: [], step: null };
  },
  reduce(scene: CacheScene, event: FacetRuntimeEvent): CacheScene {
    if (event.type === 'init') {
      const p = record(event.payload);
      return {
        base: {
          layers: num(p, 'layers'),
          kvHeads: num(p, 'kvHeads'),
          headDim: num(p, 'headDim'),
          valueBytes: num(p, 'valueBytes'),
          perPosition: num(p, 'perPosition'),
          limit: num(p, 'limit'),
        },
        stack: [],
        step: null,
      };
    }
    if (event.type === 'grow') {
      const p = record(event.payload);
      const from = num(p, 'from');
      const to = num(p, 'positions');
      return {
        base: scene.base,
        stack: [...scene.stack, { from, to, bytes: num(p, 'bytes'), perPosition: num(p, 'perPosition') }],
        step: { kind: 'grow', from, to },
      };
    }
    return scene;
  },
};
