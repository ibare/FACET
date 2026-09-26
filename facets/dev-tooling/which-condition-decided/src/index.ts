import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { whichConditionDecided, type WhichConditionDecidedFacetData } from './algorithm';
import { whichConditionDecidedScene } from './scene';
import { whichConditionDecidedStageView } from './which-condition-decided-stage';
import { whichConditionDecidedIRs } from './irs';
import { whichConditionDecidedFacet } from './facet';

export * from './algorithm';
export * from './scene';
export { whichConditionDecidedStageView } from './which-condition-decided-stage';
export { whichConditionDecidedIRs } from './irs';
export { whichConditionDecidedFacet } from './facet';

export function registerWhichConditionDecided(): void {
  registerAlgorithm<WhichConditionDecidedFacetData>('whichConditionDecided', whichConditionDecided, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('whichConditionDecidedScene', whichConditionDecidedScene);
  for (const ir of whichConditionDecidedIRs) registerIR(ir.id, ir);
  registerView('which-condition-decided-stage', whichConditionDecidedStageView);
  registerFacets([whichConditionDecidedFacet]);
}
