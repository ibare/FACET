import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { vectorNormalize, type VectorNormalizeFacetData } from './algorithm.js';
import { vectorNormalizeScene } from './scene.js';
import { vectorNormalizeStageView } from './vector-normalize-stage.js';
import { vectorNormalizeIRs } from './irs.js';
import { vectorNormalizeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './vector-normalize-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerVectorNormalize(): void {
  registerAlgorithm<VectorNormalizeFacetData>('vectorNormalize', vectorNormalize, { mechanismKind: 'reactive' });
  registerScenePlan('vectorNormalizeScene', vectorNormalizeScene);
  for (const ir of vectorNormalizeIRs) registerIR(ir.id, ir);
  registerView('vector-normalize-stage', vectorNormalizeStageView);
  registerFacets([vectorNormalizeFacet]);
}
