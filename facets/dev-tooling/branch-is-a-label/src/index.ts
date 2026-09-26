import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { branchIsALabel, type BranchIsALabelFacetData } from './algorithm.js';
import { branchIsALabelScene } from './scene.js';
import { branchIsALabelStageView } from './branch-is-a-label-stage.js';
import { branchIsALabelIRs } from './irs.js';
import { branchIsALabelFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './branch-is-a-label-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerBranchIsALabel(): void {
  registerAlgorithm<BranchIsALabelFacetData>('branchIsALabel', branchIsALabel, { mechanismKind: 'reactive' });
  registerScenePlan('branchIsALabelScene', branchIsALabelScene);
  for (const ir of branchIsALabelIRs) registerIR(ir.id, ir);
  registerView('branch-is-a-label-stage', branchIsALabelStageView);
  registerFacets([branchIsALabelFacet]);
}
