import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { crossProductPerpendicular, type CrossProductPerpendicularFacetData } from './algorithm.js';
import { crossProductPerpendicularScene } from './scene.js';
import { crossProductPerpendicularStageView } from './cross-product-perpendicular-stage.js';
import { crossProductPerpendicularIRs } from './irs.js';
import { crossProductPerpendicularFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { crossProductPerpendicularStageView } from './cross-product-perpendicular-stage.js';
export { crossProductPerpendicularIRs } from './irs.js';
export { crossProductPerpendicularFacet } from './facet.js';

export function registerCrossProductPerpendicular(): void {
  registerAlgorithm<CrossProductPerpendicularFacetData>('crossProductPerpendicular', crossProductPerpendicular, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('crossProductPerpendicularScene', crossProductPerpendicularScene);
  for (const ir of crossProductPerpendicularIRs) registerIR(ir.id, ir);
  registerView('cross-product-perpendicular-stage', crossProductPerpendicularStageView);
  registerFacets([crossProductPerpendicularFacet]);
}
