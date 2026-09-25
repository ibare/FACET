import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { multiwayBranch, type MultiwayBranchFacetData } from './algorithm.js';
import { multiwayBranchScene } from './scene.js';
import { multiwayBranchStageView } from './multiway-branch-stage.js';
import { multiwayBranchIRs } from './irs.js';
import { multiwayBranchFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './multiway-branch-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerMultiwayBranch(): void {
  registerAlgorithm<MultiwayBranchFacetData>('multiwayBranch', multiwayBranch, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('multiwayBranchScene', multiwayBranchScene);
  for (const ir of multiwayBranchIRs) registerIR(ir.id, ir);
  registerView('multiway-branch-stage', multiwayBranchStageView);
  registerFacets([multiwayBranchFacet]);
}
