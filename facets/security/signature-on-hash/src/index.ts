/**
 * @ffacet/algorithm-signature-on-hash — 해시에 서명하기 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다.
 */

export { signatureOnHash, type SignatureOnHashFacetData } from './algorithm.js';
export { signatureOnHashProjector } from './projector.js';
export { signatureOnHashIRs } from './irs.js';
export { signatureOnHashFacet } from './facet.js';
export { signatureOnHashDescription } from './description.js';
export { signHashStageView } from './sign-hash-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { signatureOnHash, type SignatureOnHashFacetData } from './algorithm.js';
import { signatureOnHashProjector } from './projector.js';
import { signatureOnHashIRs } from './irs.js';
import { signatureOnHashFacet } from './facet.js';
import { signatureOnHashDescription } from './description.js';
import { signHashStageView } from './sign-hash-stage.js';

export function registerSignatureOnHash(): void {
  registerAlgorithm<SignatureOnHashFacetData>('signatureOnHash', signatureOnHash, {
    mechanismKind: 'reactive',
  });
  registerProjector('signatureOnHashProjector', signatureOnHashProjector);
  for (const ir of signatureOnHashIRs) registerIR(ir.id, ir);
  registerView('sign-hash-stage', signHashStageView);
  registerFacets([signatureOnHashFacet]);
  registerDescription(signatureOnHashFacet.id, signatureOnHashDescription);
}
