import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { hiddenLayerFeatures, type HiddenLayerFeaturesFacetData } from './algorithm.js';
import { hiddenLayerFeaturesScene } from './scene.js';
import { hiddenLayerFeaturesStageView } from './hidden-layer-features-stage.js';
import { hiddenLayerFeaturesIRs } from './irs.js';
import { hiddenLayerFeaturesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { hiddenLayerFeaturesStageView } from './hidden-layer-features-stage.js';
export { hiddenLayerFeaturesIRs } from './irs.js';
export { hiddenLayerFeaturesFacet } from './facet.js';

export function registerHiddenLayerFeatures(): void {
  registerAlgorithm<HiddenLayerFeaturesFacetData>('hiddenLayerFeatures', hiddenLayerFeatures, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('hiddenLayerFeaturesScene', hiddenLayerFeaturesScene);
  for (const ir of hiddenLayerFeaturesIRs) registerIR(ir.id, ir);
  registerView('hidden-layer-features-stage', hiddenLayerFeaturesStageView);
  registerFacets([hiddenLayerFeaturesFacet]);
}
