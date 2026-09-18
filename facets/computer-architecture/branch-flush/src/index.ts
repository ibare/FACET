import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { branchFlush, type BranchFlushFacetData } from './algorithm.js';
import { branchFlushScene } from './scene.js';
import { branchFlushIRs } from './irs.js';
import { branchFlushStageView } from './branch-flush-stage.js';
import { branchFlushFacet } from './facet.js';

export { branchFlush, type BranchFlushFacetData, type Instr, type Slot } from './algorithm.js';
export { branchFlushScene, type BranchFlushScene, type BranchFlushStep, type Verdict } from './scene.js';
export { branchFlushIRs } from './irs.js';
export { branchFlushStageView } from './branch-flush-stage.js';
export { branchFlushFacet } from './facet.js';

export function registerBranchFlush(): void {
  registerAlgorithm<BranchFlushFacetData>('branchFlush', branchFlush, { mechanismKind: 'reactive' });
  registerScenePlan('branchFlushScene', branchFlushScene);
  for (const ir of branchFlushIRs) registerIR(ir.id, ir);
  registerView('branch-flush-stage', branchFlushStageView);
  registerFacets([branchFlushFacet]);
}
