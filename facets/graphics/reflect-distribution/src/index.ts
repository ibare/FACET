import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { reflectDistribution, type ReflectDistributionFacetData } from './algorithm.js';
import { reflectDistributionScene } from './scene.js';
import { reflectDistributionIRs } from './irs.js';
import { reflectDistributionStageView } from './reflect-distribution-stage.js';
import { reflectDistributionFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './reflect-distribution-stage.js';
export * from './facet.js';

export function registerReflectDistribution(): void {
  registerAlgorithm<ReflectDistributionFacetData>('reflectDistribution', reflectDistribution, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('reflectDistributionScene', reflectDistributionScene);
  for (const ir of reflectDistributionIRs) registerIR(ir.id, ir);
  registerView('reflect-distribution-stage', reflectDistributionStageView);
  registerFacets([reflectDistributionFacet]);
}
