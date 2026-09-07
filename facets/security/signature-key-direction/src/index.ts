/**
 * @ffacet/algorithm-signature-key-direction — 키 방향의 역전 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다.
 */

export { signatureKeyDirection, type SignatureKeyDirectionFacetData } from './algorithm.js';
export { signatureKeyDirectionProjector } from './projector.js';
export { signatureKeyDirectionIRs } from './irs.js';
export { signatureKeyDirectionFacet } from './facet.js';
export { signatureKeyDirectionDescription } from './description.js';
export { keyDirectionStageView } from './key-direction-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { signatureKeyDirection, type SignatureKeyDirectionFacetData } from './algorithm.js';
import { signatureKeyDirectionProjector } from './projector.js';
import { signatureKeyDirectionIRs } from './irs.js';
import { signatureKeyDirectionFacet } from './facet.js';
import { signatureKeyDirectionDescription } from './description.js';
import { keyDirectionStageView } from './key-direction-stage.js';

export function registerSignatureKeyDirection(): void {
  registerAlgorithm<SignatureKeyDirectionFacetData>(
    'signatureKeyDirection',
    signatureKeyDirection,
    { mechanismKind: 'reactive' },
  );
  registerProjector('signatureKeyDirectionProjector', signatureKeyDirectionProjector);
  for (const ir of signatureKeyDirectionIRs) registerIR(ir.id, ir);
  registerView('key-direction-stage', keyDirectionStageView);
  registerFacets([signatureKeyDirectionFacet]);
  registerDescription(signatureKeyDirectionFacet.id, signatureKeyDirectionDescription);
}
