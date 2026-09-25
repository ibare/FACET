import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { layerWrapsPayload, type LayerWrapsPayloadFacetData } from './algorithm.js';
import { layerWrapsPayloadScene } from './scene.js';
import { layerWrapsPayloadIRs } from './irs.js';
import { layerWrapsPayloadStageView } from './layer-wraps-payload-stage.js';
import { layerWrapsPayloadFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './layer-wraps-payload-stage.js';
export * from './facet.js';

export function registerLayerWrapsPayload(): void {
  registerAlgorithm<LayerWrapsPayloadFacetData>('layerWrapsPayload', layerWrapsPayload, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('layerWrapsPayloadScene', layerWrapsPayloadScene);
  for (const ir of layerWrapsPayloadIRs) registerIR(ir.id, ir);
  registerView('layer-wraps-payload-stage', layerWrapsPayloadStageView);
  registerFacets([layerWrapsPayloadFacet]);
}
