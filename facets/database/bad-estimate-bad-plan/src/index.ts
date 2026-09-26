import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { badEstimateBadPlan, type BadEstimateBadPlanFacetData } from './algorithm.js';
import { badEstimateBadPlanScene } from './scene.js';
import { badEstimateBadPlanStageView } from './bad-estimate-bad-plan-stage.js';
import { badEstimateBadPlanIRs } from './irs.js';
import { badEstimateBadPlanFacet } from './facet.js';

export { badEstimateBadPlan, type BadEstimateBadPlanFacetData, type PathCost } from './algorithm.js';
export {
  badEstimateBadPlanScene,
  type BadEstimateScene,
  type BadEstimateBase,
  type BadEstimateStep,
  type ScenePathCost,
} from './scene.js';
export { badEstimateBadPlanStageView } from './bad-estimate-bad-plan-stage.js';
export { badEstimateBadPlanIRs } from './irs.js';
export { badEstimateBadPlanFacet } from './facet.js';

export function registerBadEstimateBadPlan(): void {
  registerAlgorithm<BadEstimateBadPlanFacetData>('badEstimateBadPlan', badEstimateBadPlan, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('badEstimateBadPlanScene', badEstimateBadPlanScene);
  for (const ir of badEstimateBadPlanIRs) registerIR(ir.id, ir);
  registerView('bad-estimate-bad-plan-stage', badEstimateBadPlanStageView);
  registerFacets([badEstimateBadPlanFacet]);
}
