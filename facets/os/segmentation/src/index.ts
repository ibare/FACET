import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { segmentationAlgorithm, type SegmentationData } from './algorithm.js';
import { segmentationProjector } from './projector.js';
import { segmentationIRs } from './irs.js';
import { segmentationStageView } from './segmentation-stage.js';
import { segmentationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './segmentation-stage.js';
export * from './facet.js';

export function registerSegmentation(): void {
  registerAlgorithm<SegmentationData>('segmentation', segmentationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('segmentationProjector', segmentationProjector);
  for (const ir of segmentationIRs) registerIR(ir.id, ir);
  registerView('segmentation-stage', segmentationStageView);
  registerFacets([segmentationFacet]);
}
