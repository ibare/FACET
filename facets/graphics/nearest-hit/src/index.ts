import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nearestHit } from './algorithm.js';
import type { NearestHitFacetData } from './algorithm.js';
import { nearestHitScene } from './scene.js';
import { nearestHitStageView } from './nearest-hit-stage.js';
import { nearestHitIRs } from './irs.js';
import { nearestHitFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { nearestHitStageView } from './nearest-hit-stage.js';
export { nearestHitIRs } from './irs.js';
export { nearestHitFacet } from './facet.js';

export function registerNearestHit(): void {
  registerAlgorithm<NearestHitFacetData>('nearestHit', nearestHit, { mechanismKind: 'reactive' });
  registerScenePlan('nearestHitScene', nearestHitScene);
  for (const ir of nearestHitIRs) registerIR(ir.id, ir);
  registerView('nearest-hit-stage', nearestHitStageView);
  registerFacets([nearestHitFacet]);
}
