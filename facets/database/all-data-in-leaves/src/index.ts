import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { allDataInLeaves, type AllDataInLeavesFacetData } from './algorithm.js';
import { allDataInLeavesScene } from './scene.js';
import { allDataInLeavesStageView } from './all-data-in-leaves-stage.js';
import { allDataInLeavesIRs } from './irs.js';
import { allDataInLeavesFacet } from './facet.js';

export { allDataInLeaves, type AllDataInLeavesFacetData, type PageData, type LookupData } from './algorithm.js';
export { allDataInLeavesScene, type AllDataInLeavesScene, type ReadMark, type ScenePage } from './scene.js';
export { allDataInLeavesStageView } from './all-data-in-leaves-stage.js';
export { allDataInLeavesIRs } from './irs.js';
export { allDataInLeavesFacet } from './facet.js';

export function registerAllDataInLeaves(): void {
  registerAlgorithm<AllDataInLeavesFacetData>('allDataInLeaves', allDataInLeaves, { mechanismKind: 'reactive' });
  registerScenePlan('allDataInLeavesScene', allDataInLeavesScene);
  for (const ir of allDataInLeavesIRs) registerIR(ir.id, ir);
  registerView('all-data-in-leaves-stage', allDataInLeavesStageView);
  registerFacets([allDataInLeavesFacet]);
}
