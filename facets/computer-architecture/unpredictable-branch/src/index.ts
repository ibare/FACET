import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { unpredictableBranch, type UnpredictableBranchFacetData } from './algorithm.js';
import { unpredictableBranchScene } from './scene.js';
import { unpredictableBranchIRs } from './irs.js';
import { unpredictableBranchStageView } from './unpredictable-branch-stage.js';
import { unpredictableBranchFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './unpredictable-branch-stage.js';
export * from './facet.js';

export function registerUnpredictableBranch(): void {
  registerAlgorithm<UnpredictableBranchFacetData>('unpredictableBranch', unpredictableBranch, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('unpredictableBranchScene', unpredictableBranchScene);
  for (const ir of unpredictableBranchIRs) registerIR(ir.id, ir);
  registerView('unpredictable-branch-stage', unpredictableBranchStageView);
  registerFacets([unpredictableBranchFacet]);
}
