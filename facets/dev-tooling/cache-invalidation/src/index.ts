/**
 * cache-invalidation — 층 캐시는 앞 층의 열쇠를 품으므로 바뀐 층 뒤가 전부 다시 된다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { cacheInvalidationAlgorithm, type CacheInvalidationData } from './algorithm.js';
import { cacheInvalidationProjector } from './projector.js';
import { cacheInvalidationIRs } from './irs.js';
import { cacheInvalidationStageView } from './cache-invalidation-stage.js';
import { cacheInvalidationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './cache-invalidation-stage.js';
export * from './facet.js';

export function registerCacheInvalidation(): void {
  registerAlgorithm<CacheInvalidationData>('cacheInvalidation', cacheInvalidationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('cacheInvalidationProjector', cacheInvalidationProjector);
  for (const ir of cacheInvalidationIRs) registerIR(ir.id, ir);
  registerView('cache-invalidation-stage', cacheInvalidationStageView);
  registerFacets([cacheInvalidationFacet]);
}
