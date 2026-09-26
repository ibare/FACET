/**
 * @ffacet/algorithm-queueing-model — 서버 하나 대기열에서 들쭉날쭉함이 기다림을 가른다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { queueingModelAlgorithm, type QueueingModelData } from './algorithm.js';
import { queueingModelFacet } from './facet.js';
import { queueingModelIRs } from './irs.js';
import { queueingModelProjector } from './projector.js';
import { queueingModelStageView } from './queueing-model-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './queueing-model-stage.js';
export * from './facet.js';

export function registerQueueingModel(): void {
  registerAlgorithm<QueueingModelData>('queueingModel', queueingModelAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('queueingModelProjector', queueingModelProjector);
  for (const ir of queueingModelIRs) registerIR(ir.id, ir);
  registerView('queueing-model-stage', queueingModelStageView);
  registerFacets([queueingModelFacet]);
}
