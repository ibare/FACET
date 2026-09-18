import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { batchingAndPaddingAlgorithm, type BatchingAndPaddingData } from './algorithm.js';
import { batchingAndPaddingProjector } from './projector.js';
import { batchingAndPaddingIRs } from './irs.js';
import { batchingAndPaddingStageView } from './batching-and-padding-stage.js';
import { batchingAndPaddingFacet } from './facet.js';

export {
  batchingAndPaddingAlgorithm,
  busyPercent,
  type BatchingAndPaddingData,
  type BatchingAndPaddingRequest,
  type BatchLane,
  type BatchMove,
  type BatchFinish,
} from './algorithm.js';
export { batchingAndPaddingProjector } from './projector.js';
export { batchingAndPaddingImperativeIR, batchingAndPaddingIRs } from './irs.js';
export {
  batchingAndPaddingStageView,
  type BatchStage,
  type BatchStageState,
  type BatchStageCaption,
  type BatchStageLane,
  type BatchStageRequest,
} from './batching-and-padding-stage.js';
export { batchingAndPaddingFacet } from './facet.js';

export function registerBatchingAndPadding(): void {
  registerAlgorithm<BatchingAndPaddingData>('batchingAndPadding', batchingAndPaddingAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('batchingAndPaddingProjector', batchingAndPaddingProjector);
  for (const ir of batchingAndPaddingIRs) registerIR(ir.id, ir);
  registerView('batching-and-padding-stage', batchingAndPaddingStageView);
  registerFacets([batchingAndPaddingFacet]);
}
