import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { networkLayerAlgorithm, type NetworkLayerData } from './algorithm.js';
import { networkLayerProjector } from './projector.js';
import { networkLayerIRs } from './irs.js';
import { networkLayerStageView } from './network-layer-stage.js';
import { networkLayerFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './network-layer-stage.js';
export * from './facet.js';

export function registerNetworkLayer(): void {
  registerAlgorithm<NetworkLayerData>('networkLayer', networkLayerAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('networkLayerProjector', networkLayerProjector);
  for (const ir of networkLayerIRs) registerIR(ir.id, ir);
  registerView('network-layer-stage', networkLayerStageView);
  registerFacets([networkLayerFacet]);
}
