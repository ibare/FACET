import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { evictLeastRecent, type EvictLeastRecentFacetData } from './algorithm.js';
import { evictLeastRecentScene } from './scene.js';
import { evictLeastRecentStageView } from './evict-least-recent-stage.js';
import { evictLeastRecentIRs } from './irs.js';
import { evictLeastRecentFacet } from './facet.js';

export { evictLeastRecent, type EvictLeastRecentFacetData } from './algorithm.js';
export {
  evictLeastRecentScene,
  type EvictLeastRecentScene,
  type LruSlot,
  type LruStays,
  type LruStep,
} from './scene.js';
export { evictLeastRecentStageView } from './evict-least-recent-stage.js';
export { evictLeastRecentIRs } from './irs.js';
export { evictLeastRecentFacet } from './facet.js';

export function registerEvictLeastRecent(): void {
  registerAlgorithm<EvictLeastRecentFacetData>('evictLeastRecent', evictLeastRecent, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('evictLeastRecentScene', evictLeastRecentScene);
  for (const ir of evictLeastRecentIRs) registerIR(ir.id, ir);
  registerView('evict-least-recent-stage', evictLeastRecentStageView);
  registerFacets([evictLeastRecentFacet]);
}
