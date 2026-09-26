import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { majorityDecides, type MajorityDecidesFacetData } from './algorithm';
import { majorityDecidesScene } from './scene';
import { majorityDecidesStageView } from './majority-decides-stage';
import { majorityDecidesIRs } from './irs';
import { majorityDecidesFacet } from './facet';

export { majorityDecides, majorityDecidesScene, majorityDecidesStageView, majorityDecidesIRs, majorityDecidesFacet };
export type { MajorityDecidesFacetData, MajorityDecidesNode } from './algorithm';
export type { MajorityDecidesScene, MajorityStep, MajorityCopy, MajorityEntry, MajorityFollower } from './scene';

export function registerMajorityDecides(): void {
  registerAlgorithm<MajorityDecidesFacetData>('majorityDecides', majorityDecides, { mechanismKind: 'reactive' });
  registerScenePlan('majorityDecidesScene', majorityDecidesScene);
  for (const ir of majorityDecidesIRs) registerIR(ir.id, ir);
  registerView('majority-decides-stage', majorityDecidesStageView);
  registerFacets([majorityDecidesFacet]);
}
