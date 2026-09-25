import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { evictOldest, type EvictOldestFacetData } from './algorithm.js';
import { evictOldestScene } from './scene.js';
import { evictOldestIRs } from './irs.js';
import { evictOldestStageView } from './evict-oldest-stage.js';
import { evictOldestFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './evict-oldest-stage.js';
export * from './facet.js';

export function registerEvictOldest(): void {
  registerAlgorithm<EvictOldestFacetData>('evictOldest', evictOldest, { mechanismKind: 'reactive' });
  registerScenePlan('evictOldestScene', evictOldestScene);
  for (const ir of evictOldestIRs) registerIR(ir.id, ir);
  registerView('evict-oldest-stage', evictOldestStageView);
  registerFacets([evictOldestFacet]);
}
