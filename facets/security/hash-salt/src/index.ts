/**
 * @ffacet/algorithm-hash-salt — 소금 치기 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다.
 */

export { hashSalt, type HashSaltFacetData, type SaltedUser } from './algorithm.js';
export { hashSaltProjector } from './projector.js';
export { hashSaltIRs } from './irs.js';
export { hashSaltFacet } from './facet.js';
export { hashSaltDescription } from './description.js';
export { saltStageView } from './salt-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hashSalt, type HashSaltFacetData } from './algorithm.js';
import { hashSaltProjector } from './projector.js';
import { hashSaltIRs } from './irs.js';
import { hashSaltFacet } from './facet.js';
import { hashSaltDescription } from './description.js';
import { saltStageView } from './salt-stage.js';

export function registerHashSalt(): void {
  registerAlgorithm<HashSaltFacetData>('hashSalt', hashSalt, {
    mechanismKind: 'reactive',
  });
  registerProjector('hashSaltProjector', hashSaltProjector);
  for (const ir of hashSaltIRs) registerIR(ir.id, ir);
  registerView('salt-stage', saltStageView);
  registerFacets([hashSaltFacet]);
  registerDescription(hashSaltFacet.id, hashSaltDescription);
}
