import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { learningRateTooBig, type LearningRateTooBigFacetData } from './algorithm.js';
import { learningRateTooBigScene } from './scene.js';
import { learningRateTooBigIRs } from './irs.js';
import { learningRateTooBigStageView } from './learning-rate-too-big-stage.js';
import { learningRateTooBigFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './learning-rate-too-big-stage.js';
export * from './facet.js';

export function registerLearningRateTooBig(): void {
  registerAlgorithm<LearningRateTooBigFacetData>('learningRateTooBig', learningRateTooBig, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('learningRateTooBigScene', learningRateTooBigScene);
  for (const ir of learningRateTooBigIRs) registerIR(ir.id, ir);
  registerView('learning-rate-too-big-stage', learningRateTooBigStageView);
  registerFacets([learningRateTooBigFacet]);
}
