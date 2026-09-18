import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lanesInStep, type LanesInStepFacetData } from './algorithm.js';
import { lanesInStepScene } from './scene.js';
import { lanesInStepIRs } from './irs.js';
import { lanesInStepStageView } from './lanes-in-step-stage.js';
import { lanesInStepFacet } from './facet.js';

export { lanesInStep, type LanesInStepFacetData } from './algorithm.js';
export { lanesInStepScene, type LanesInStepScene, type LanesInStepStep } from './scene.js';
export { lanesInStepIRs } from './irs.js';
export { lanesInStepStageView } from './lanes-in-step-stage.js';
export { lanesInStepFacet } from './facet.js';

export function registerLanesInStep(): void {
  registerAlgorithm<LanesInStepFacetData>('lanesInStep', lanesInStep, { mechanismKind: 'reactive' });
  registerScenePlan('lanesInStepScene', lanesInStepScene);
  for (const ir of lanesInStepIRs) registerIR(ir.id, ir);
  registerView('lanes-in-step-stage', lanesInStepStageView);
  registerFacets([lanesInStepFacet]);
}
