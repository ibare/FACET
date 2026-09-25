import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { receiverWindow, type ReceiverWindowFacetData } from './algorithm.js';
import { receiverWindowScene } from './scene.js';
import { receiverWindowIRs } from './irs.js';
import { receiverWindowStageView } from './receiver-window-stage.js';
import { receiverWindowFacet } from './facet.js';

export { receiverWindow, type ReceiverWindowFacetData } from './algorithm.js';
export {
  receiverWindowScene,
  type ReceiverWindowScene,
  type ReceiverWindowBase,
  type ReceiverWindowStep,
} from './scene.js';
export { receiverWindowIRs } from './irs.js';
export { receiverWindowStageView } from './receiver-window-stage.js';
export { receiverWindowFacet } from './facet.js';

export function registerReceiverWindow(): void {
  registerAlgorithm<ReceiverWindowFacetData>('receiverWindow', receiverWindow, { mechanismKind: 'reactive' });
  registerScenePlan('receiverWindowScene', receiverWindowScene);
  for (const ir of receiverWindowIRs) registerIR(ir.id, ir);
  registerView('receiver-window-stage', receiverWindowStageView);
  registerFacets([receiverWindowFacet]);
}
