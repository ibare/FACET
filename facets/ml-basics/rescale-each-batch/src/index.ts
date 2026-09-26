import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { rescaleEachBatch, type RescaleEachBatchFacetData } from './algorithm';
import { rescaleEachBatchFacet } from './facet';
import { rescaleEachBatchIRs } from './irs';
import { rescaleEachBatchScene } from './scene';
import { rescaleEachBatchStageView } from './rescale-each-batch-stage';

export * from './algorithm';
export * from './scene';
export { rescaleEachBatchStageView } from './rescale-each-batch-stage';
export { rescaleEachBatchIRs } from './irs';
export { rescaleEachBatchFacet } from './facet';

export function registerRescaleEachBatch(): void {
  registerAlgorithm<RescaleEachBatchFacetData>('rescaleEachBatch', rescaleEachBatch, { mechanismKind: 'reactive' });
  registerScenePlan('rescaleEachBatchScene', rescaleEachBatchScene);
  for (const ir of rescaleEachBatchIRs) registerIR(ir.id, ir);
  registerView('rescale-each-batch-stage', rescaleEachBatchStageView);
  registerFacets([rescaleEachBatchFacet]);
}
