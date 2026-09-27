import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { gradientStep, type GradientStepFacetData } from './algorithm.js';
import { gradientStepScene } from './scene.js';
import { gradientStepStageView } from './gradient-step-stage.js';
import { gradientStepIRs } from './irs.js';
import { gradientStepFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { gradientStepStageView } from './gradient-step-stage.js';
export { gradientStepIRs } from './irs.js';
export { gradientStepFacet } from './facet.js';

export function registerGradientStep(): void {
  registerAlgorithm<GradientStepFacetData>('gradientStep', gradientStep, { mechanismKind: 'reactive' });
  registerScenePlan('gradientStepScene', gradientStepScene);
  for (const ir of gradientStepIRs) registerIR(ir.id, ir);
  registerView('gradient-step-stage', gradientStepStageView);
  registerFacets([gradientStepFacet]);
}
