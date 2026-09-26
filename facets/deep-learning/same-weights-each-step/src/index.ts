import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sameWeightsEachStep, type SameWeightsEachStepFacetData } from './algorithm.js';
import { sameWeightsEachStepScene } from './scene.js';
import { sameWeightsEachStepStageView } from './same-weights-each-step-stage.js';
import { sameWeightsEachStepIRs } from './irs.js';
import { sameWeightsEachStepFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './same-weights-each-step-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSameWeightsEachStep(): void {
  registerAlgorithm<SameWeightsEachStepFacetData>('sameWeightsEachStep', sameWeightsEachStep, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sameWeightsEachStepScene', sameWeightsEachStepScene);
  for (const ir of sameWeightsEachStepIRs) registerIR(ir.id, ir);
  registerView('same-weights-each-step-stage', sameWeightsEachStepStageView);
  registerFacets([sameWeightsEachStepFacet]);
}
