/**
 * @ffacet/algorithm-merkle-tree — 머클 트리 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene).
 */

export {
  merkleTree,
  type MerkleTreeFacetData,
  type MerkleLeaf,
  type MerkleSnapshot,
} from './algorithm.js';
export {
  merkleTreeScene,
  captionOf,
  leafCountOf,
  leafHashOf,
  leafLabelOf,
  midValueOf,
  printedHexLengthOf,
  rootValueOf,
  sideOfLeafIn,
  type MerkleCaption,
  type MerkleSceneLeaf,
  type MerkleSceneTree,
  type MerkleStep,
  type MerkleTreeScene,
  type MerkleValue,
} from './scene.js';
export { merkleTreeIRs } from './irs.js';
export { merkleTreeFacet } from './facet.js';
export { merkleStageView } from './merkle-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { merkleTree, type MerkleTreeFacetData } from './algorithm.js';
import { merkleTreeScene } from './scene.js';
import { merkleTreeIRs } from './irs.js';
import { merkleTreeFacet } from './facet.js';
import { merkleStageView } from './merkle-stage.js';

export function registerMerkleTree(): void {
  registerAlgorithm<MerkleTreeFacetData>('merkleTree', merkleTree, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('merkleTreeScene', merkleTreeScene);
  for (const ir of merkleTreeIRs) registerIR(ir.id, ir);
  registerView('merkle-stage', merkleStageView);
  registerFacets([merkleTreeFacet]);
}
