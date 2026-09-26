import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { noOverlap, type NoOverlapFacetData } from './algorithm.js';
import { noOverlapScene } from './scene.js';
import { noOverlapIRs } from './irs.js';
import { noOverlapStageView } from './no-overlap-stage.js';
import { noOverlapFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './no-overlap-stage.js';
export * from './facet.js';

export function registerNoOverlap(): void {
  registerAlgorithm<NoOverlapFacetData>('noOverlap', noOverlap, { mechanismKind: 'reactive' });
  registerScenePlan('noOverlapScene', noOverlapScene);
  for (const ir of noOverlapIRs) registerIR(ir.id, ir);
  registerView('no-overlap-stage', noOverlapStageView);
  registerFacets([noOverlapFacet]);
}
