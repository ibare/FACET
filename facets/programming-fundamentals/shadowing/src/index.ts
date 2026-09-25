import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shadowing, type ShadowingFacetData } from './algorithm.js';
import { shadowingScene } from './scene.js';
import { shadowingStageView } from './shadowing-stage.js';
import { shadowingIRs } from './irs.js';
import { shadowingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './shadowing-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerShadowing(): void {
  registerAlgorithm<ShadowingFacetData>('shadowing', shadowing, { mechanismKind: 'reactive' });
  registerScenePlan('shadowingScene', shadowingScene);
  for (const ir of shadowingIRs) registerIR(ir.id, ir);
  registerView('shadowing-stage', shadowingStageView);
  registerFacets([shadowingFacet]);
}
