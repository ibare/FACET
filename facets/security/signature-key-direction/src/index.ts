/**
 * @ffacet/algorithm-signature-key-direction — 키 방향의 역전 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지 않는다
 * (S-facet).
 */

export { signatureKeyDirection, type SignatureKeyDirectionFacetData } from './algorithm.js';
export { signatureKeyDirectionIRs } from './irs.js';
export { signatureKeyDirectionFacet } from './facet.js';
export { keyDirectionStageView } from './key-direction-stage.js';
export {
  signatureKeyDirectionScene,
  type KeyDirectionCaption,
  type KeyDirectionFlow,
  type KeyDirectionScene,
  type KeyDirectionStep,
} from './scene.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { signatureKeyDirection, type SignatureKeyDirectionFacetData } from './algorithm.js';
import { signatureKeyDirectionIRs } from './irs.js';
import { signatureKeyDirectionFacet } from './facet.js';
import { keyDirectionStageView } from './key-direction-stage.js';
import { signatureKeyDirectionScene } from './scene.js';

export function registerSignatureKeyDirection(): void {
  registerAlgorithm<SignatureKeyDirectionFacetData>(
    'signatureKeyDirection',
    signatureKeyDirection,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('signatureKeyDirectionScene', signatureKeyDirectionScene);
  for (const ir of signatureKeyDirectionIRs) registerIR(ir.id, ir);
  registerView('key-direction-stage', keyDirectionStageView);
  registerFacets([signatureKeyDirectionFacet]);
}
