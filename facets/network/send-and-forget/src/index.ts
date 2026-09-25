import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sendAndForget, type SendAndForgetFacetData } from './algorithm.js';
import { sendAndForgetScene } from './scene.js';
import { sendAndForgetStageView } from './send-and-forget-stage.js';
import { sendAndForgetIRs } from './irs.js';
import { sendAndForgetFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './send-and-forget-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSendAndForget(): void {
  registerAlgorithm<SendAndForgetFacetData>('sendAndForget', sendAndForget, { mechanismKind: 'reactive' });
  registerScenePlan('sendAndForgetScene', sendAndForgetScene);
  for (const ir of sendAndForgetIRs) registerIR(ir.id, ir);
  registerView('send-and-forget-stage', sendAndForgetStageView);
  registerFacets([sendAndForgetFacet]);
}
