/**
 * evict-least-frequent 조각 — 등록 진입점.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { evictLeastFrequent, type EvictLeastFrequentFacetData } from './algorithm.js';
import { evictLeastFrequentScene } from './scene.js';
import { evictLeastFrequentStageView } from './evict-least-frequent-stage.js';
import { evictLeastFrequentIRs } from './irs.js';
import { evictLeastFrequentFacet } from './facet.js';

export {
  evictLeastFrequent,
  pickVictim,
  readEvictLeastFrequentData,
  type EvictLeastFrequentFacetData,
  type LfuEntry,
} from './algorithm.js';
export {
  evictLeastFrequentScene,
  type EvictLeastFrequentScene,
  type LfuSlot,
  type LfuStep,
} from './scene.js';
export { evictLeastFrequentStageView } from './evict-least-frequent-stage.js';
export { evictLeastFrequentIRs } from './irs.js';
export { evictLeastFrequentFacet } from './facet.js';

export function registerEvictLeastFrequent(): void {
  registerAlgorithm<EvictLeastFrequentFacetData>('evictLeastFrequent', evictLeastFrequent, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('evictLeastFrequentScene', evictLeastFrequentScene);
  for (const ir of evictLeastFrequentIRs) registerIR(ir.id, ir);
  registerView('evict-least-frequent-stage', evictLeastFrequentStageView);
  registerFacets([evictLeastFrequentFacet]);
}
