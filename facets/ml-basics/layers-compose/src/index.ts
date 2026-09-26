import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { layersCompose, type LayersComposeFacetData } from './algorithm.js';
import { layersComposeScene } from './scene.js';
import { layersComposeIRs } from './irs.js';
import { layersComposeStageView } from './layers-compose-stage.js';
import { layersComposeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './layers-compose-stage.js';
export * from './facet.js';

export function registerLayersCompose(): void {
  registerAlgorithm<LayersComposeFacetData>('layersCompose', layersCompose, { mechanismKind: 'reactive' });
  registerScenePlan('layersComposeScene', layersComposeScene);
  for (const ir of layersComposeIRs) registerIR(ir.id, ir);
  registerView('layers-compose-stage', layersComposeStageView);
  registerFacets([layersComposeFacet]);
}
