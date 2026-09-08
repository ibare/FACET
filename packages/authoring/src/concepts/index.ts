/**
 * 개념 선언 집합.
 *
 * 개념이 늘어나면 이 배열에 추가한다. facet 카탈로그(@ffacet/bootstrap)와의
 * 정합 — canonicalFacet 이 실재하는 facet id 인지, domain 이 디렉터리 구조와
 * 맞는지 — 은 향후 catalog codegen 이 검사한다.
 *
 * contrastWith 참조 무결성
 * ────────────────────────────
 * materialize 가 contrastWith 참조를 검증한다. 미선언 id 는 오타를 뜻한다 —
 * 실제로 facet 개명 뒤 queue 가 옛 id(linkedList)를 가리키고 있던 것이 이
 * 검증으로 드러났다.
 *
 * useWhen 되풀이
 * ────────────────────────────
 * 개념이 늘면 손으로 훑을 수 없다. `pnpm concept:audit` 이 useWhen 겹침 ·
 * 글의 구성에 관여하는 말 · 분류 어휘 누출 · 미선언 참조 · 빈 자리를 본다.
 * 자동 판정이 아니라 후보를 뽑아 사람에게 보이는 도구다.
 */

import type { FacetConceptSource } from '../concept-types.js';
import { arrayConcept } from './array.js';
import { asymmetricRsaConcept } from './asymmetric-rsa.js';
import { bfsConcept } from './bfs.js';
import { bstConcept } from './bst.js';
import { bubbleSortConcept } from './bubble-sort.js';
import { cachingCdnConcept } from './caching-cdn.js';
import { conditionalStatementConcept } from './conditional-statement.js';
import { contextSwitchingConcept } from './context-switching.js';
import { hashAvalancheConcept } from './hash-avalanche.js';
import { hashChainConcept } from './hash-chain.js';
import { hashIntegrityCheckConcept } from './hash-integrity-check.js';
import { hashSaltConcept } from './hash-salt.js';
import { hashFixedLengthConcept } from './hash-fixed-length.js';
import { hashTableChainingConcept } from './hash-table-chaining.js';
import { pigeonholeCollisionConcept } from './pigeonhole-collision.js';
import { ipRoutingConcept } from './ip-routing.js';
import { linearRegressionConcept } from './linear-regression.js';
import { linkedListSinglyConcept } from './linked-list-singly.js';
import { merkleTreeConcept } from './merkle-tree.js';
import { lruCacheConcept } from './lru-cache.js';
import { matrixTransform2dConcept } from './matrix-transform-2d.js';
import { messagingPubsubConcept } from './messaging-pubsub.js';
import { relationalTablesAndKeysConcept } from './relational-tables-and-keys.js';
import { tokenizationConcept } from './tokenization.js';
import { queueFifoConcept } from './queue.js';
import { signatureKeyDirectionConcept } from './signature-key-direction.js';
import { signatureOnHashConcept } from './signature-on-hash.js';
import { stackConcept } from './stack.js';
import { adjacencyListVsMatrixConcept } from './adjacency-list-vs-matrix.js';
import { arrayAsTreeConcept } from './array-as-tree.js';
import { avlTreeConcept } from './avl-tree.js';
import { bTreeConcept } from './b-tree.js';
import { blackHeightEqualConcept } from './black-height-equal.js';
import { bstCompareAndGoConcept } from './bst-compare-and-go.js';
import { bstDegenerateConcept } from './bst-degenerate.js';
import { bstInorderSortedConcept } from './bst-inorder-sorted.js';
import { chainingBucketConcept } from './chaining-bucket.js';
import { circularBufferWrapConcept } from './circular-buffer-wrap.js';
import { depthDoublesCountConcept } from './depth-doubles-count.js';
import { dequeBothEndsConcept } from './deque-both-ends.js';
import { enqueueDequeueEndsConcept } from './enqueue-dequeue-ends.js';
import { findRootConcept } from './find-root.js';
import { growAndCopyConcept } from './grow-and-copy.js';
import { hashToBucketConcept } from './hash-to-bucket.js';
import { heapBinaryConcept } from './heap-binary.js';
import { heapPropertyConcept } from './heap-property.js';
import { heightBalanceCheckConcept } from './height-balance-check.js';
import { heightStaysLowConcept } from './height-stays-low.js';
import { indexAddressCalcConcept } from './index-address-calc.js';
import { loadFactorRehashConcept } from './load-factor-rehash.js';
import { lostLinkConcept } from './lost-link.js';
import { nodeHoldsManyConcept } from './node-holds-many.js';
import { nodePointsNextConcept } from './node-points-next.js';
import { openAddressingProbeConcept } from './open-addressing-probe.js';
import { outOfBoundsConcept } from './out-of-bounds.js';
import { parentTwoChildrenConcept } from './parent-two-children.js';
import { pathCompressionConcept } from './path-compression.js';
import { pushPopTopConcept } from './push-pop-top.js';
import { recolorThenRotateConcept } from './recolor-then-rotate.js';
import { redBlackTreeConcept } from './red-black-tree.js';
import { relinkInsertConcept } from './relink-insert.js';
import { rotateToBalanceConcept } from './rotate-to-balance.js';
import { sharePrefixPathConcept } from './share-prefix-path.js';
import { shiftOnInsertConcept } from './shift-on-insert.js';
import { shiftOnRemoveConcept } from './shift-on-remove.js';
import { siftDownConcept } from './sift-down.js';
import { siftUpConcept } from './sift-up.js';
import { splitWhenFullConcept } from './split-when-full.js';
import { traversalOrderConcept } from './traversal-order.js';
import { traverseFromHeadConcept } from './traverse-from-head.js';
import { trieConcept } from './trie.js';
import { unionByRankConcept } from './union-by-rank.js';
import { unionFindConcept } from './union-find.js';
import { walkPerCharacterConcept } from './walk-per-character.js';

export const CONCEPT_SOURCES: readonly FacetConceptSource[] = [
  queueFifoConcept,
  stackConcept,
  bfsConcept,
  bstConcept,
  bubbleSortConcept,
  arrayConcept,
  linkedListSinglyConcept,
  hashAvalancheConcept,
  hashChainConcept,
  hashIntegrityCheckConcept,
  hashSaltConcept,
  merkleTreeConcept,
  signatureKeyDirectionConcept,
  signatureOnHashConcept,
  hashFixedLengthConcept,
  hashTableChainingConcept,
  pigeonholeCollisionConcept,
  lruCacheConcept,
  tokenizationConcept,
  relationalTablesAndKeysConcept,
  matrixTransform2dConcept,
  linearRegressionConcept,
  ipRoutingConcept,
  contextSwitchingConcept,
  conditionalStatementConcept,
  asymmetricRsaConcept,
  cachingCdnConcept,
  messagingPubsubConcept,
  adjacencyListVsMatrixConcept,
  arrayAsTreeConcept,
  avlTreeConcept,
  bTreeConcept,
  blackHeightEqualConcept,
  bstCompareAndGoConcept,
  bstDegenerateConcept,
  bstInorderSortedConcept,
  chainingBucketConcept,
  circularBufferWrapConcept,
  depthDoublesCountConcept,
  dequeBothEndsConcept,
  enqueueDequeueEndsConcept,
  findRootConcept,
  growAndCopyConcept,
  hashToBucketConcept,
  heapBinaryConcept,
  heapPropertyConcept,
  heightBalanceCheckConcept,
  heightStaysLowConcept,
  indexAddressCalcConcept,
  loadFactorRehashConcept,
  lostLinkConcept,
  nodeHoldsManyConcept,
  nodePointsNextConcept,
  openAddressingProbeConcept,
  outOfBoundsConcept,
  parentTwoChildrenConcept,
  pathCompressionConcept,
  pushPopTopConcept,
  recolorThenRotateConcept,
  redBlackTreeConcept,
  relinkInsertConcept,
  rotateToBalanceConcept,
  sharePrefixPathConcept,
  shiftOnInsertConcept,
  shiftOnRemoveConcept,
  siftDownConcept,
  siftUpConcept,
  splitWhenFullConcept,
  traversalOrderConcept,
  traverseFromHeadConcept,
  trieConcept,
  unionByRankConcept,
  unionFindConcept,
  walkPerCharacterConcept,
];
