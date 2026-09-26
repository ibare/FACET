import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { denoiseStepByStep, type DenoiseStepByStepFacetData } from './algorithm.js';
import { denoiseStepByStepScene } from './scene.js';
import { denoiseStepByStepStageView } from './denoise-step-by-step-stage.js';
import { denoiseStepByStepIRs } from './irs.js';
import { denoiseStepByStepFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './denoise-step-by-step-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDenoiseStepByStep(): void {
  registerAlgorithm<DenoiseStepByStepFacetData>('denoiseStepByStep', denoiseStepByStep, { mechanismKind: 'reactive' });
  registerScenePlan('denoiseStepByStepScene', denoiseStepByStepScene);
  for (const ir of denoiseStepByStepIRs) registerIR(ir.id, ir);
  registerView('denoise-step-by-step-stage', denoiseStepByStepStageView);
  registerFacets([denoiseStepByStepFacet]);
}
