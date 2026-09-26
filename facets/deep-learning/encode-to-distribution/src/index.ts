import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { encodeToDistribution, type EncodeToDistributionFacetData } from './algorithm.js';
import { encodeToDistributionScene } from './scene.js';
import { encodeToDistributionStageView } from './encode-to-distribution-stage.js';
import { encodeToDistributionIRs } from './irs.js';
import { encodeToDistributionFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './encode-to-distribution-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerEncodeToDistribution(): void {
  registerAlgorithm<EncodeToDistributionFacetData>('encodeToDistribution', encodeToDistribution, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('encodeToDistributionScene', encodeToDistributionScene);
  for (const ir of encodeToDistributionIRs) registerIR(ir.id, ir);
  registerView('encode-to-distribution-stage', encodeToDistributionStageView);
  registerFacets([encodeToDistributionFacet]);
}
