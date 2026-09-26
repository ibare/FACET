import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { layerPromotion, type LayerPromotionFacetData } from './algorithm.js';
import { layerPromotionScene } from './scene.js';
import { layerPromotionStageView } from './layer-promotion-stage.js';
import { layerPromotionIRs } from './irs.js';
import { layerPromotionFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './layer-promotion-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerLayerPromotion(): void {
  registerAlgorithm<LayerPromotionFacetData>('layerPromotion', layerPromotion, { mechanismKind: 'reactive' });
  registerScenePlan('layerPromotionScene', layerPromotionScene);
  for (const ir of layerPromotionIRs) registerIR(ir.id, ir);
  registerView('layer-promotion-stage', layerPromotionStageView);
  registerFacets([layerPromotionFacet]);
}
