import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { gradientThroughLayers, type GradientThroughLayersFacetData } from './algorithm.js';
import { gradientThroughLayersScene } from './scene.js';
import { gradientThroughLayersStageView } from './gradient-through-layers-stage.js';
import { gradientThroughLayersIRs } from './irs.js';
import { gradientThroughLayersFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './gradient-through-layers-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerGradientThroughLayers(): void {
  registerAlgorithm<GradientThroughLayersFacetData>('gradientThroughLayers', gradientThroughLayers, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('gradientThroughLayersScene', gradientThroughLayersScene);
  for (const ir of gradientThroughLayersIRs) registerIR(ir.id, ir);
  registerView('gradient-through-layers-stage', gradientThroughLayersStageView);
  registerFacets([gradientThroughLayersFacet]);
}
