import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { vectorScale, type VectorScaleFacetData } from './algorithm.js';
import { vectorScaleScene } from './scene.js';
import { vectorScaleStageView } from './vector-scale-stage.js';
import { vectorScaleIRs } from './irs.js';
import { vectorScaleFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './vector-scale-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerVectorScale(): void {
  registerAlgorithm<VectorScaleFacetData>('vectorScale', vectorScale, { mechanismKind: 'reactive' });
  registerScenePlan('vectorScaleScene', vectorScaleScene);
  for (const ir of vectorScaleIRs) registerIR(ir.id, ir);
  registerView('vector-scale-stage', vectorScaleStageView);
  registerFacets([vectorScaleFacet]);
}
