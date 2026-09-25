import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { firstComeFirstRun, type FirstComeFirstRunFacetData } from './algorithm';
import { firstComeFirstRunScene } from './scene';
import { firstComeFirstRunStageView } from './first-come-first-run-stage';
import { firstComeFirstRunIRs } from './irs';
import { firstComeFirstRunFacet } from './facet';

export { firstComeFirstRun, type FirstComeFirstRunFacetData, type FcfsProc } from './algorithm';
export {
  firstComeFirstRunScene,
  type FirstComeFirstRunScene,
  type FcfsStep,
  type FcfsPlaced,
  type FcfsIdle,
  type FcfsSceneProc,
} from './scene';
export { firstComeFirstRunStageView } from './first-come-first-run-stage';
export { firstComeFirstRunIRs } from './irs';
export { firstComeFirstRunFacet } from './facet';

export function registerFirstComeFirstRun(): void {
  registerAlgorithm<FirstComeFirstRunFacetData>('firstComeFirstRun', firstComeFirstRun, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('firstComeFirstRunScene', firstComeFirstRunScene);
  for (const ir of firstComeFirstRunIRs) registerIR(ir.id, ir);
  registerView('first-come-first-run-stage', firstComeFirstRunStageView);
  registerFacets([firstComeFirstRunFacet]);
}
