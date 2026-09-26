import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { perParameterStep, type PerParameterStepFacetData } from './algorithm.js';
import { perParameterStepScene } from './scene.js';
import { perParameterStepStageView } from './per-parameter-step-stage.js';
import { perParameterStepIRs } from './irs.js';
import { perParameterStepFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './per-parameter-step-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPerParameterStep(): void {
  registerAlgorithm<PerParameterStepFacetData>('perParameterStep', perParameterStep, { mechanismKind: 'reactive' });
  registerScenePlan('perParameterStepScene', perParameterStepScene);
  for (const ir of perParameterStepIRs) registerIR(ir.id, ir);
  registerView('per-parameter-step-stage', perParameterStepStageView);
  registerFacets([perParameterStepFacet]);
}
