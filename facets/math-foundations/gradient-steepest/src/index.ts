import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { gradientSteepest, type GradientSteepestFacetData } from './algorithm.js';
import { gradientSteepestScene } from './scene.js';
import { gradientSteepestStageView } from './gradient-steepest-stage.js';
import { gradientSteepestIRs } from './irs.js';
import { gradientSteepestFacet } from './facet.js';

export { gradientSteepest, narrowGradientSteepestData, sampleAngles } from './algorithm.js';
export type { GradientSteepestFacetData, Term2 } from './algorithm.js';
export { gradientSteepestScene } from './scene.js';
export type {
  GradientSteepestScene,
  GradientSteepestBase,
  GradientSteepestMark,
  GradientSteepestGrad,
  GradientSteepestStep,
} from './scene.js';
export { gradientSteepestStageView } from './gradient-steepest-stage.js';
export { gradientSteepestIRs } from './irs.js';
export { gradientSteepestFacet } from './facet.js';

export function registerGradientSteepest(): void {
  registerAlgorithm<GradientSteepestFacetData>('gradientSteepest', gradientSteepest, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('gradientSteepestScene', gradientSteepestScene);
  for (const ir of gradientSteepestIRs) registerIR(ir.id, ir);
  registerView('gradient-steepest-stage', gradientSteepestStageView);
  registerFacets([gradientSteepestFacet]);
}
