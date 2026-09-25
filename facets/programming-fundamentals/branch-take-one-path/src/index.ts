import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { branchTakeOnePath, type BranchTakeOnePathFacetData } from './algorithm.js';
import { branchTakeOnePathScene } from './scene.js';
import { branchTakeOnePathStageView } from './branch-take-one-path-stage.js';
import { branchTakeOnePathIRs } from './irs.js';
import { branchTakeOnePathFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './branch-take-one-path-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerBranchTakeOnePath(): void {
  registerAlgorithm<BranchTakeOnePathFacetData>('branchTakeOnePath', branchTakeOnePath, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('branchTakeOnePathScene', branchTakeOnePathScene);
  for (const ir of branchTakeOnePathIRs) registerIR(ir.id, ir);
  registerView('branch-take-one-path-stage', branchTakeOnePathStageView);
  registerFacets([branchTakeOnePathFacet]);
}
