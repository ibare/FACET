/**
 * @ffacet/algorithm-hash-chain — 해시 사슬 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다.
 */

export { hashChain, type HashChainFacetData, type ChainBlock, type ChainTamper } from './algorithm.js';
export { hashChainProjector } from './projector.js';
export { hashChainIRs } from './irs.js';
export { hashChainFacet } from './facet.js';
export { hashChainDescription } from './description.js';
export { chainStageView } from './chain-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { hashChain, type HashChainFacetData } from './algorithm.js';
import { hashChainProjector } from './projector.js';
import { hashChainIRs } from './irs.js';
import { hashChainFacet } from './facet.js';
import { hashChainDescription } from './description.js';
import { chainStageView } from './chain-stage.js';

export function registerHashChain(): void {
  registerAlgorithm<HashChainFacetData>('hashChain', hashChain, {
    mechanismKind: 'reactive',
  });
  registerProjector('hashChainProjector', hashChainProjector);
  for (const ir of hashChainIRs) registerIR(ir.id, ir);
  registerView('chain-stage', chainStageView);
  registerFacets([hashChainFacet]);
  registerDescription(hashChainFacet.id, hashChainDescription);
}
