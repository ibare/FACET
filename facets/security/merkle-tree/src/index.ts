/**
 * @ffacet/algorithm-merkle-tree — 머클 트리 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기 버튼
 * 하나 외에는 조작을 받지 않는다.
 */

export {
  merkleTree,
  type MerkleTreeFacetData,
  type MerkleLeaf,
  type MerkleSnapshot,
} from './algorithm.js';
export { merkleTreeProjector } from './projector.js';
export { merkleTreeIRs } from './irs.js';
export { merkleTreeFacet } from './facet.js';
export { merkleTreeDescription } from './description.js';
export { merkleStageView } from './merkle-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { merkleTree, type MerkleTreeFacetData } from './algorithm.js';
import { merkleTreeProjector } from './projector.js';
import { merkleTreeIRs } from './irs.js';
import { merkleTreeFacet } from './facet.js';
import { merkleTreeDescription } from './description.js';
import { merkleStageView } from './merkle-stage.js';

export function registerMerkleTree(): void {
  registerAlgorithm<MerkleTreeFacetData>('merkleTree', merkleTree, {
    mechanismKind: 'reactive',
  });
  registerProjector('merkleTreeProjector', merkleTreeProjector);
  for (const ir of merkleTreeIRs) registerIR(ir.id, ir);
  registerView('merkle-stage', merkleStageView);
  registerFacets([merkleTreeFacet]);
  registerDescription(merkleTreeFacet.id, merkleTreeDescription);
}
