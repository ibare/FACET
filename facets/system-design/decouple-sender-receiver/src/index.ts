import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { decoupleSenderReceiver, type DecoupleSenderReceiverFacetData } from './algorithm.js';
import { decoupleSenderReceiverScene } from './scene.js';
import { decoupleSenderReceiverStageView } from './decouple-sender-receiver-stage.js';
import { decoupleSenderReceiverIRs } from './irs.js';
import { decoupleSenderReceiverFacet } from './facet.js';

export { decoupleSenderReceiver, narrowDecoupleData } from './algorithm.js';
export type { DecoupleSenderReceiverFacetData, DecoupleEvent } from './algorithm.js';
export { decoupleSenderReceiverScene } from './scene.js';
export type { DecoupleScene, DecoupleStep, DecoupleLive, PublishRecord } from './scene.js';
export { decoupleSenderReceiverStageView } from './decouple-sender-receiver-stage.js';
export { decoupleSenderReceiverIRs } from './irs.js';
export { decoupleSenderReceiverFacet } from './facet.js';

export function registerDecoupleSenderReceiver(): void {
  registerAlgorithm<DecoupleSenderReceiverFacetData>('decoupleSenderReceiver', decoupleSenderReceiver, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('decoupleSenderReceiverScene', decoupleSenderReceiverScene);
  for (const ir of decoupleSenderReceiverIRs) registerIR(ir.id, ir);
  registerView('decouple-sender-receiver-stage', decoupleSenderReceiverStageView);
  registerFacets([decoupleSenderReceiverFacet]);
}
