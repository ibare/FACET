import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { cacheHitMiss, type CacheHitMissFacetData } from './algorithm.js';
import { cacheHitMissScene } from './scene.js';
import { cacheHitMissIRs } from './irs.js';
import { cacheHitMissStageView } from './cache-hit-miss-stage.js';
import { cacheHitMissFacet } from './facet.js';

export { cacheHitMiss, narrowCacheHitMissData, runRequests } from './algorithm.js';
export type { CacheHitMissFacetData, RequestKind, RequestOutcome } from './algorithm.js';
export { cacheHitMissScene } from './scene.js';
export type { CacheHitMissScene, CacheHitMissRun, CacheHitMissStep, DoneRequest } from './scene.js';
export { cacheHitMissIRs } from './irs.js';
export { cacheHitMissStageView } from './cache-hit-miss-stage.js';
export { cacheHitMissFacet } from './facet.js';

export function registerCacheHitMiss(): void {
  registerAlgorithm<CacheHitMissFacetData>('cacheHitMiss', cacheHitMiss, { mechanismKind: 'reactive' });
  registerScenePlan('cacheHitMissScene', cacheHitMissScene);
  for (const ir of cacheHitMissIRs) registerIR(ir.id, ir);
  registerView('cache-hit-miss-stage', cacheHitMissStageView);
  registerFacets([cacheHitMissFacet]);
}
