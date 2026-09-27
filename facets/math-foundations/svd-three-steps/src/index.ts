import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { svdThreeSteps, type SvdThreeStepsFacetData } from './algorithm.js';
import { svdThreeStepsScene } from './scene.js';
import { svdThreeStepsStageView } from './svd-three-steps-stage.js';
import { svdThreeStepsIRs } from './irs.js';
import { svdThreeStepsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './svd-three-steps-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSvdThreeSteps(): void {
  registerAlgorithm<SvdThreeStepsFacetData>('svdThreeSteps', svdThreeSteps, { mechanismKind: 'reactive' });
  registerScenePlan('svdThreeStepsScene', svdThreeStepsScene);
  for (const ir of svdThreeStepsIRs) registerIR(ir.id, ir);
  registerView('svd-three-steps-stage', svdThreeStepsStageView);
  registerFacets([svdThreeStepsFacet]);
}
