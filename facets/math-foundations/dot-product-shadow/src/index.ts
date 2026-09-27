import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { dotProductShadow, type DotProductShadowFacetData } from './algorithm.js';
import { dotProductShadowScene } from './scene.js';
import { dotProductShadowStageView } from './dot-product-shadow-stage.js';
import { dotProductShadowIRs } from './irs.js';
import { dotProductShadowFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { dotProductShadowStageView } from './dot-product-shadow-stage.js';
export { dotProductShadowIRs } from './irs.js';
export { dotProductShadowFacet } from './facet.js';

export function registerDotProductShadow(): void {
  registerAlgorithm<DotProductShadowFacetData>('dotProductShadow', dotProductShadow, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('dotProductShadowScene', dotProductShadowScene);
  for (const ir of dotProductShadowIRs) registerIR(ir.id, ir);
  registerView('dot-product-shadow-stage', dotProductShadowStageView);
  registerFacets([dotProductShadowFacet]);
}
