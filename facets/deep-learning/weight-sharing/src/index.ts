import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { weightSharing, type WeightSharingFacetData } from './algorithm.js';
import { weightSharingScene } from './scene.js';
import { weightSharingStageView } from './weight-sharing-stage.js';
import { weightSharingIRs } from './irs.js';
import { weightSharingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './weight-sharing-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWeightSharing(): void {
  registerAlgorithm<WeightSharingFacetData>('weightSharing', weightSharing, { mechanismKind: 'reactive' });
  registerScenePlan('weightSharingScene', weightSharingScene);
  for (const ir of weightSharingIRs) registerIR(ir.id, ir);
  registerView('weight-sharing-stage', weightSharingStageView);
  registerFacets([weightSharingFacet]);
}
