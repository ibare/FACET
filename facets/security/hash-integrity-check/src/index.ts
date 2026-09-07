/**
 * @ffacet/algorithm-hash-integrity-check — 무결성 대조 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다.
 */

export { hashIntegrityCheck, type HashIntegrityFacetData, type ReceivedItem } from './algorithm.js';
export { hashIntegrityCheckProjector } from './projector.js';
export { hashIntegrityCheckIRs } from './irs.js';
export { hashIntegrityCheckFacet } from './facet.js';
export { hashIntegrityCheckDescription } from './description.js';
export { integrityStageView } from './integrity-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hashIntegrityCheck, type HashIntegrityFacetData } from './algorithm.js';
import { hashIntegrityCheckProjector } from './projector.js';
import { hashIntegrityCheckIRs } from './irs.js';
import { hashIntegrityCheckFacet } from './facet.js';
import { hashIntegrityCheckDescription } from './description.js';
import { integrityStageView } from './integrity-stage.js';

export function registerHashIntegrityCheck(): void {
  registerAlgorithm<HashIntegrityFacetData>('hashIntegrityCheck', hashIntegrityCheck, {
    mechanismKind: 'reactive',
  });
  registerProjector('hashIntegrityCheckProjector', hashIntegrityCheckProjector);
  for (const ir of hashIntegrityCheckIRs) registerIR(ir.id, ir);
  registerView('integrity-stage', integrityStageView);
  registerFacets([hashIntegrityCheckFacet]);
  registerDescription(hashIntegrityCheckFacet.id, hashIntegrityCheckDescription);
}
