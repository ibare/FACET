import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sharedVsExclusive, type SharedVsExclusiveFacetData } from './algorithm.js';
import { sharedVsExclusiveScene } from './scene.js';
import { sharedVsExclusiveStageView } from './shared-vs-exclusive-stage.js';
import { sharedVsExclusiveIRs } from './irs.js';
import { sharedVsExclusiveFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './shared-vs-exclusive-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSharedVsExclusive(): void {
  registerAlgorithm<SharedVsExclusiveFacetData>('sharedVsExclusive', sharedVsExclusive, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sharedVsExclusiveScene', sharedVsExclusiveScene);
  for (const ir of sharedVsExclusiveIRs) registerIR(ir.id, ir);
  registerView('shared-vs-exclusive-stage', sharedVsExclusiveStageView);
  registerFacets([sharedVsExclusiveFacet]);
}
