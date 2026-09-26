import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sendToIdlest, type SendToIdlestFacetData } from './algorithm';
import { sendToIdlestScene } from './scene';
import { sendToIdlestIRs } from './irs';
import { sendToIdlestStageView } from './send-to-idlest-stage';
import { sendToIdlestFacet } from './facet';

export { sendToIdlest, narrowSendToIdlestData, pickIdlest, type SendToIdlestFacetData } from './algorithm';
export { sendToIdlestScene, type SendToIdlestScene, type IdlestConn, type IdlestRow, type IdlestStep } from './scene';
export { sendToIdlestIRs } from './irs';
export { sendToIdlestStageView } from './send-to-idlest-stage';
export { sendToIdlestFacet } from './facet';

export function registerSendToIdlest(): void {
  registerAlgorithm<SendToIdlestFacetData>('sendToIdlest', sendToIdlest, { mechanismKind: 'reactive' });
  registerScenePlan('sendToIdlestScene', sendToIdlestScene);
  for (const ir of sendToIdlestIRs) registerIR(ir.id, ir);
  registerView('send-to-idlest-stage', sendToIdlestStageView);
  registerFacets([sendToIdlestFacet]);
}
