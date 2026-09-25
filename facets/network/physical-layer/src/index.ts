import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { physicalLayerAlgorithm, type PhysicalLayerData } from './algorithm.js';
import { physicalLayerFacet } from './facet.js';
import { physicalLayerIRs } from './irs.js';
import { physicalLayerStageView } from './physical-layer-stage.js';
import { physicalLayerProjector } from './projector.js';

export { physicalLayerAlgorithm, computePhysicalLayer, type PhysicalLayerData, type PhysicalLayerRun } from './algorithm.js';
export { physicalLayerProjector } from './projector.js';
export { physicalLayerImperativeIR, physicalLayerIRs } from './irs.js';
export { physicalLayerStageView, hexByte, type PhysicalLayerStage } from './physical-layer-stage.js';
export { physicalLayerFacet } from './facet.js';

export function registerPhysicalLayer(): void {
  registerAlgorithm<PhysicalLayerData>('physicalLayer', physicalLayerAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('physicalLayerProjector', physicalLayerProjector);
  for (const ir of physicalLayerIRs) registerIR(ir.id, ir);
  registerView('physical-layer-stage', physicalLayerStageView);
  registerFacets([physicalLayerFacet]);
}
