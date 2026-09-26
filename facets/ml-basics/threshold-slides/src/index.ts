import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { thresholdSlides, type ThresholdSlidesFacetData } from './algorithm.js';
import { thresholdSlidesFacet } from './facet.js';
import { thresholdSlidesIRs } from './irs.js';
import { thresholdSlidesScene } from './scene.js';
import { thresholdSlidesStageView } from './threshold-slides-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './threshold-slides-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerThresholdSlides(): void {
  registerAlgorithm<ThresholdSlidesFacetData>('thresholdSlides', thresholdSlides, { mechanismKind: 'reactive' });
  registerScenePlan('thresholdSlidesScene', thresholdSlidesScene);
  for (const ir of thresholdSlidesIRs) registerIR(ir.id, ir);
  registerView('threshold-slides-stage', thresholdSlidesStageView);
  registerFacets([thresholdSlidesFacet]);
}
