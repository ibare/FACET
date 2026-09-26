import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { originPull, type OriginPullFacetData } from './algorithm.js';
import { originPullScene } from './scene.js';
import { originPullStageView } from './origin-pull-stage.js';
import { originPullIRs } from './irs.js';
import { originPullFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './origin-pull-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerOriginPull(): void {
  registerAlgorithm<OriginPullFacetData>('originPull', originPull, { mechanismKind: 'reactive' });
  registerScenePlan('originPullScene', originPullScene);
  for (const ir of originPullIRs) registerIR(ir.id, ir);
  registerView('origin-pull-stage', originPullStageView);
  registerFacets([originPullFacet]);
}
