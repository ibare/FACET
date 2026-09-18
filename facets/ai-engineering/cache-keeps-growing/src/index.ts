import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { cacheKeepsGrowing, type CacheKeepsGrowingFacetData } from './algorithm.js';
import { cacheKeepsGrowingScene } from './scene.js';
import { cacheKeepsGrowingIRs } from './irs.js';
import { cacheKeepsGrowingStageView } from './cache-keeps-growing-stage.js';
import { cacheKeepsGrowingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './cache-keeps-growing-stage.js';
export * from './facet.js';

export function registerCacheKeepsGrowing(): void {
  registerAlgorithm<CacheKeepsGrowingFacetData>('cacheKeepsGrowing', cacheKeepsGrowing, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('cacheKeepsGrowingScene', cacheKeepsGrowingScene);
  for (const ir of cacheKeepsGrowingIRs) registerIR(ir.id, ir);
  registerView('cache-keeps-growing-stage', cacheKeepsGrowingStageView);
  registerFacets([cacheKeepsGrowingFacet]);
}
