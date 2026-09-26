import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { linesCoveredBranchNot, type LinesCoveredBranchNotFacetData } from './algorithm.js';
import { linesCoveredBranchNotFacet } from './facet.js';
import { linesCoveredBranchNotIRs } from './irs.js';
import { linesCoveredBranchNotStageView } from './lines-covered-branch-not-stage.js';
import { linesCoveredBranchNotScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './lines-covered-branch-not-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerLinesCoveredBranchNot(): void {
  registerAlgorithm<LinesCoveredBranchNotFacetData>('linesCoveredBranchNot', linesCoveredBranchNot, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('linesCoveredBranchNotScene', linesCoveredBranchNotScene);
  for (const ir of linesCoveredBranchNotIRs) registerIR(ir.id, ir);
  registerView('lines-covered-branch-not-stage', linesCoveredBranchNotStageView);
  registerFacets([linesCoveredBranchNotFacet]);
}
