/**
 * branchCoverage — 커버리지와 변이 점수. 등록 진입점.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { branchCoverageAlgorithm, type BranchCoverageData } from './algorithm.js';
import { branchCoverageProjector } from './projector.js';
import { branchCoverageIRs } from './irs.js';
import { branchCoverageStageView } from './branch-coverage-stage.js';
import { branchCoverageFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './branch-coverage-stage.js';
export * from './facet.js';

export function registerBranchCoverage(): void {
  registerAlgorithm<BranchCoverageData>('branchCoverage', branchCoverageAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('branchCoverageProjector', branchCoverageProjector);
  for (const ir of branchCoverageIRs) registerIR(ir.id, ir);
  registerView('branch-coverage-stage', branchCoverageStageView);
  registerFacets([branchCoverageFacet]);
}
