import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { keyPlusMessage, type KeyPlusMessageFacetData } from './algorithm.js';
import { keyPlusMessageScene } from './scene.js';
import { keyPlusMessageStageView } from './key-plus-message-stage.js';
import { keyPlusMessageIRs } from './irs.js';
import { keyPlusMessageFacet } from './facet.js';

export {
  keyPlusMessage,
  narrowKeyPlusMessageData,
  toyHash,
  toyMac,
  type KeyPlusMessageFacetData,
} from './algorithm.js';
export { keyPlusMessageScene, type KeyPlusMessageScene } from './scene.js';
export { keyPlusMessageStageView } from './key-plus-message-stage.js';
export { keyPlusMessageIRs } from './irs.js';
export { keyPlusMessageFacet } from './facet.js';

export function registerKeyPlusMessage(): void {
  registerAlgorithm<KeyPlusMessageFacetData>('keyPlusMessage', keyPlusMessage, { mechanismKind: 'reactive' });
  registerScenePlan('keyPlusMessageScene', keyPlusMessageScene);
  for (const ir of keyPlusMessageIRs) registerIR(ir.id, ir);
  registerView('key-plus-message-stage', keyPlusMessageStageView);
  registerFacets([keyPlusMessageFacet]);
}
