import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { weightedFairShareAlgorithm, type WeightedFairShareData } from './algorithm.js';
import { weightedFairShareFacet } from './facet.js';
import { weightedFairShareIRs } from './irs.js';
import { weightedFairShareProjector } from './projector.js';
import { weightedFairShareStageView } from './weighted-fair-share-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './weighted-fair-share-stage.js';

export function registerWeightedFairShare(): void {
  registerAlgorithm<WeightedFairShareData>('weightedFairShare', weightedFairShareAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('weightedFairShareProjector', weightedFairShareProjector);
  for (const ir of weightedFairShareIRs) registerIR(ir.id, ir);
  registerView('weighted-fair-share-stage', weightedFairShareStageView);
  registerFacets([weightedFairShareFacet]);
}
