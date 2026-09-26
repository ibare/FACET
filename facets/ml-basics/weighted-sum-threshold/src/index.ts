import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { weightedSumThreshold, type WeightedSumThresholdFacetData } from './algorithm.js';
import { weightedSumThresholdScene } from './scene.js';
import { weightedSumThresholdStageView } from './weighted-sum-threshold-stage.js';
import { weightedSumThresholdIRs } from './irs.js';
import { weightedSumThresholdFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './weighted-sum-threshold-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWeightedSumThreshold(): void {
  registerAlgorithm<WeightedSumThresholdFacetData>('weightedSumThreshold', weightedSumThreshold, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('weightedSumThresholdScene', weightedSumThresholdScene);
  for (const ir of weightedSumThresholdIRs) registerIR(ir.id, ir);
  registerView('weighted-sum-threshold-stage', weightedSumThresholdStageView);
  registerFacets([weightedSumThresholdFacet]);
}
