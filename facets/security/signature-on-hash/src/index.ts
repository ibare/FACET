/**
 * @ffacet/algorithm-signature-on-hash — 해시에 서명하기 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). algorithm / scene / facet JSON / 전용 view
 * (sign-hash-stage) 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 두지 않는다.
 */

export { signatureOnHash, type SignatureOnHashFacetData } from './algorithm.js';
export {
  signatureOnHashScene,
  captionOf,
  timesLargerOf,
  type SignatureOnHashScene,
  type SignHashBase,
  type SignHashCaption,
  type SignHashStep,
} from './scene.js';
export { signatureOnHashIRs } from './irs.js';
export { signatureOnHashFacet } from './facet.js';
export { signHashStageView } from './sign-hash-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { signatureOnHash, type SignatureOnHashFacetData } from './algorithm.js';
import { signatureOnHashScene } from './scene.js';
import { signatureOnHashIRs } from './irs.js';
import { signatureOnHashFacet } from './facet.js';
import { signHashStageView } from './sign-hash-stage.js';

export function registerSignatureOnHash(): void {
  registerAlgorithm<SignatureOnHashFacetData>('signatureOnHash', signatureOnHash, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('signatureOnHashScene', signatureOnHashScene);
  for (const ir of signatureOnHashIRs) registerIR(ir.id, ir);
  registerView('sign-hash-stage', signHashStageView);
  registerFacets([signatureOnHashFacet]);
}
