/**
 * 캐시가 자란다 — 자리가 늘 때마다 KV 캐시가 차지하는 바이트를 정수로 셈한다.
 *
 * 규약: 바이트 = 2 (K 와 V) × 층 × K·V 머리 × 머리 차원 × 자리 수 × 값 바이트. 묶음은 1.
 *
 * 이벤트
 *   init  (silent)  { layers, kvHeads, headDim, valueBytes, perPosition, limit }
 *                   perPosition = 자리 하나의 바이트 (알고리즘이 셈한다)
 *                   limit       = 문맥 길이 한도 (자리 수)
 *   grow            { from, positions, bytes, perPosition }
 *                   from      = 앞 걸음의 자리 수 (처음은 0)
 *                   positions = 이번 걸음의 자리 수
 *                   bytes     = 그 자리 수의 캐시 바이트 (알고리즘이 셈한다)
 *                   perPosition = bytes ÷ positions — 걸음마다 같은 값이 나오는 것이 주장이다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CacheModel = {
  layers: number;
  kvHeads: number;
  headDim: number;
  valueBytes: number;
};

export type CacheKeepsGrowingFacetData = {
  type: 'cache-keeps-growing';
  model: CacheModel;
  /** 보일 자리 수. 오름차순. */
  positions: number[];
  /** 문맥 길이 한도 (자리 수). */
  contextLimit: number;
  stepMs: number;
};

export type CacheInitPayload = CacheModel & { perPosition: number; limit: number };
export type CacheGrowPayload = { from: number; positions: number; bytes: number; perPosition: number };

/** 자리 n 개의 캐시 바이트. K 와 V 둘이라 2 를 곱한다. */
function cacheBytes(model: CacheModel, n: number): number {
  return 2 * model.layers * model.kvHeads * model.headDim * n * model.valueBytes;
}

export async function cacheKeepsGrowing(
  context: FacetContext<CacheKeepsGrowingFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<CacheKeepsGrowingFacetData>;
  const { model, positions, contextLimit, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const init: CacheInitPayload = {
    layers: model.layers,
    kvHeads: model.kvHeads,
    headDim: model.headDim,
    valueBytes: model.valueBytes,
    perPosition: cacheBytes(model, 1),
    limit: contextLimit,
  };
  await ctx.emit({ type: 'init', payload: init, silent: true });

  let from = 0;
  for (let i = 0; i < positions.length; i += 1) {
    if (ctx.cancelled) return;
    // 첫 걸음은 기다리지 않는다 — 마운트 직후 빈 화면을 두지 않는다.
    if (i > 0 && !(await pause())) return;
    const n = positions[i]!;
    const bytes = cacheBytes(model, n);
    const grow: CacheGrowPayload = { from, positions: n, bytes, perPosition: bytes / n };
    await ctx.emit({ type: 'grow', payload: grow });
    from = n;
  }
}
