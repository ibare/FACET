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
import { adjacencyListVsMatrixConcept } from './adjacency-list-vs-matrix.js';
import { arrayConcept } from './array.js';
import { arrayAsTreeConcept } from './array-as-tree.js';
import { assignThenMoveConcept } from './assign-then-move.js';
import { asymmetricRsaConcept } from './asymmetric-rsa.js';
import { avlTreeConcept } from './avl-tree.js';
import { bTreeConcept } from './b-tree.js';
import { backtrackingConcept } from './backtracking.js';
import { baggingSampleConcept } from './bagging-sample.js';
import { bellmanFordConcept } from './bellman-ford.js';
import { bfsConcept } from './bfs.js';
import { binarySearchConcept } from './binary-search.js';
import { blackHeightEqualConcept } from './black-height-equal.js';
import { bottleneckSetsFlowConcept } from './bottleneck-sets-flow.js';
import { bottomUpTableConcept } from './bottom-up-table.js';
import { boundAndCutConcept } from './bound-and-cut.js';
import { branchAndBoundConcept } from './branch-and-bound.js';
import { bstConcept } from './bst.js';
import { bstCompareAndGoConcept } from './bst-compare-and-go.js';
import { bstDegenerateConcept } from './bst-degenerate.js';
import { bstInorderSortedConcept } from './bst-inorder-sorted.js';
import { bubbleAdjacentSwapConcept } from './bubble-adjacent-swap.js';
import { bubbleSortConcept } from './bubble-sort.js';
import { cachingCdnConcept } from './caching-cdn.js';
import { chainingBucketConcept } from './chaining-bucket.js';
import { circularBufferWrapConcept } from './circular-buffer-wrap.js';
import { compareAndSwapConcept } from './compare-and-swap.js';
import { conditionalStatementConcept } from './conditional-statement.js';
import { contextSwitchingConcept } from './context-switching.js';
import { countThenPlaceConcept } from './count-then-place.js';
import { countingSortConcept } from './counting-sort.js';
import { cycleBlocksOrderConcept } from './cycle-blocks-order.js';
import { dbscanConcept } from './dbscan.js';
import { decisionBoundaryConcept } from './decision-boundary.js';
import { decisionTreeConcept } from './decision-tree.js';
import { dendrogramCutConcept } from './dendrogram-cut.js';
import { denseNeighborhoodConcept } from './dense-neighborhood.js';
import { depthDoublesCountConcept } from './depth-doubles-count.js';
import { dequeBothEndsConcept } from './deque-both-ends.js';
import { dfsConcept } from './dfs.js';
import { digitByDigitConcept } from './digit-by-digit.js';
import { dijkstraConcept } from './dijkstra.js';
import { directionOfMostSpreadConcept } from './direction-of-most-spread.js';
import { diveThenBacktrackConcept } from './dive-then-backtrack.js';
import { divideConquerCombineConcept } from './divide-conquer-combine.js';
import { dynamicProgrammingConcept } from './dynamic-programming.js';
import { enqueueDequeueEndsConcept } from './enqueue-dequeue-ends.js';
import { fewerHopsNotShorterConcept } from './fewer-hops-not-shorter.js';
import { findRootConcept } from './find-root.js';
import { floydWarshallConcept } from './floyd-warshall.js';
import { gapShrinkConcept } from './gap-shrink.js';
import { globalAndLocalConcept } from './global-and-local.js';
import { greedyConcept } from './greedy.js';
import { greedyCanFailConcept } from './greedy-can-fail.js';
import { growAndCopyConcept } from './grow-and-copy.js';
import { growOneTreeConcept } from './grow-one-tree.js';
import { guessByValueConcept } from './guess-by-value.js';
import { halveTheRangeConcept } from './halve-the-range.js';
import { hashAvalancheConcept } from './hash-avalanche.js';
import { hashChainConcept } from './hash-chain.js';
import { hashFixedLengthConcept } from './hash-fixed-length.js';
import { hashIntegrityCheckConcept } from './hash-integrity-check.js';
import { hashSaltConcept } from './hash-salt.js';
import { hashTableChainingConcept } from './hash-table-chaining.js';
import { hashToBucketConcept } from './hash-to-bucket.js';
import { heapBinaryConcept } from './heap-binary.js';
import { heapPropertyConcept } from './heap-property.js';
import { heapSortConcept } from './heap-sort.js';
import { heapSortExtractConcept } from './heap-sort-extract.js';
import { heightBalanceCheckConcept } from './height-balance-check.js';
import { heightStaysLowConcept } from './height-stays-low.js';
import { heuristicGuidesConcept } from './heuristic-guides.js';
import { hierarchicalConcept } from './hierarchical.js';
import { impurityDropsConcept } from './impurity-drops.js';
import { inPlaceVsExtraConcept } from './in-place-vs-extra.js';
import { indegreeZeroFirstConcept } from './indegree-zero-first.js';
import { indexAddressCalcConcept } from './index-address-calc.js';
import { insertIntoSortedPartConcept } from './insert-into-sorted-part.js';
import { insertionSortConcept } from './insertion-sort.js';
import { interpolationSearchConcept } from './interpolation-search.js';
import { ipRoutingConcept } from './ip-routing.js';
import { kChangesBoundaryConcept } from './k-changes-boundary.js';
import { kMustBeGivenConcept } from './k-must-be-given.js';
import { keepNeighborsCloseConcept } from './keep-neighbors-close.js';
import { kernelLiftsConcept } from './kernel-lifts.js';
import { kmeansConcept } from './kmeans.js';
import { knnConcept } from './knn.js';
import { kruskalMstConcept } from './kruskal-mst.js';
import { leastSquaresConcept } from './least-squares.js';
import { linearRegressionConcept } from './linear-regression.js';
import { linearSearchConcept } from './linear-search.js';
import { linkedListSinglyConcept } from './linked-list-singly.js';
import { loadFactorRehashConcept } from './load-factor-rehash.js';
import { logisticRegressionConcept } from './logistic-regression.js';
import { lostLinkConcept } from './lost-link.js';
import { lruCacheConcept } from './lru-cache.js';
import { manyTreesVoteConcept } from './many-trees-vote.js';
import { markVisitedOrLoopConcept } from './mark-visited-or-loop.js';
import { matrixTransform2dConcept } from './matrix-transform-2d.js';
import { maxFlowConcept } from './max-flow.js';
import { memoWriteOnceConcept } from './memo-write-once.js';
import { mergeNearestPairConcept } from './merge-nearest-pair.js';
import { mergeSortConcept } from './merge-sort.js';
import { mergeTwoSortedConcept } from './merge-two-sorted.js';
import { merkleTreeConcept } from './merkle-tree.js';
import { messagingPubsubConcept } from './messaging-pubsub.js';
import { mutuallyReachableConcept } from './mutually-reachable.js';
import { negativeEdgeBreaksConcept } from './negative-edge-breaks.js';
import { nodeHoldsManyConcept } from './node-holds-many.js';
import { nodePointsNextConcept } from './node-points-next.js';
import { noiseLeftOutConcept } from './noise-left-out.js';
import { oneMoreRoundDropsConcept } from './one-more-round-drops.js';
import { oneWayEdgeConcept } from './one-way-edge.js';
import { openAddressingProbeConcept } from './open-addressing-probe.js';
import { outOfBoundsConcept } from './out-of-bounds.js';
import { overlappingSubproblemsConcept } from './overlapping-subproblems.js';
import { parentTwoChildrenConcept } from './parent-two-children.js';
import { partitionAroundPivotConcept } from './partition-around-pivot.js';
import { pathCompressionConcept } from './path-compression.js';
import { pcaConcept } from './pca.js';
import { pickNearestUnsettledConcept } from './pick-nearest-unsettled.js';
import { pigeonholeCollisionConcept } from './pigeonhole-collision.js';
import { pivotChoiceMattersConcept } from './pivot-choice-matters.js';
import { primMstConcept } from './prim-mst.js';
import { projectAndLoseConcept } from './project-and-lose.js';
import { pruneBranchConcept } from './prune-branch.js';
import { pushPopTopConcept } from './push-pop-top.js';
import { queueFifoConcept } from './queue.js';
import { queueVsStackOrderConcept } from './queue-vs-stack-order.js';
import { quickSortConcept } from './quick-sort.js';
import { radixSortConcept } from './radix-sort.js';
import { randomForestConcept } from './random-forest.js';
import { recolorThenRotateConcept } from './recolor-then-rotate.js';
import { redBlackTreeConcept } from './red-black-tree.js';
import { relationalTablesAndKeysConcept } from './relational-tables-and-keys.js';
import { relaxShorterPathConcept } from './relax-shorter-path.js';
import { relinkInsertConcept } from './relink-insert.js';
import { repeatRelaxAllConcept } from './repeat-relax-all.js';
import { requiresSortedConcept } from './requires-sorted.js';
import { residualDistanceConcept } from './residual-distance.js';
import { rotateToBalanceConcept } from './rotate-to-balance.js';
import { scanUntilFoundConcept } from './scan-until-found.js';
import { sccConcept } from './scc.js';
import { selectMinEachPassConcept } from './select-min-each-pass.js';
import { selectionSortConcept } from './selection-sort.js';
import { separateComponentsConcept } from './separate-components.js';
import { sharePrefixPathConcept } from './share-prefix-path.js';
import { shellSortConcept } from './shell-sort.js';
import { shiftOnInsertConcept } from './shift-on-insert.js';
import { shiftOnRemoveConcept } from './shift-on-remove.js';
import { siftDownConcept } from './sift-down.js';
import { siftUpConcept } from './sift-up.js';
import { signatureKeyDirectionConcept } from './signature-key-direction.js';
import { signatureOnHashConcept } from './signature-on-hash.js';
import { sortEdgesAvoidCycleConcept } from './sort-edges-avoid-cycle.js';
import { sortStabilityConcept } from './sort-stability.js';
import { splitByQuestionConcept } from './split-by-question.js';
import { splitUntilOneConcept } from './split-until-one.js';
import { splitWhenFullConcept } from './split-when-full.js';
import { squashToProbabilityConcept } from './squash-to-probability.js';
import { stackConcept } from './stack.js';
import { supportVectorsOnlyConcept } from './support-vectors-only.js';
import { svmConcept } from './svm.js';
import { takeBestNowConcept } from './take-best-now.js';
import { throughMiddleNodeConcept } from './through-middle-node.js';
import { tokenizationConcept } from './tokenization.js';
import { topologicalSortConcept } from './topological-sort.js';
import { traversalOrderConcept } from './traversal-order.js';
import { traverseFromHeadConcept } from './traverse-from-head.js';
import { trieConcept } from './trie.js';
import { tryAndUndoConcept } from './try-and-undo.js';
import { tsneConcept } from './tsne.js';
import { twoColorConflictConcept } from './two-color-conflict.js';
import { undoByBackEdgeConcept } from './undo-by-back-edge.js';
import { unionByRankConcept } from './union-by-rank.js';
import { unionFindConcept } from './union-find.js';
import { voteByNeighborsConcept } from './vote-by-neighbors.js';
import { walkPerCharacterConcept } from './walk-per-character.js';
import { widestMarginConcept } from './widest-margin.js';

export const CONCEPT_SOURCES: readonly FacetConceptSource[] = [
  adjacencyListVsMatrixConcept,
  arrayConcept,
  arrayAsTreeConcept,
  assignThenMoveConcept,
  asymmetricRsaConcept,
  avlTreeConcept,
  bTreeConcept,
  backtrackingConcept,
  baggingSampleConcept,
  bellmanFordConcept,
  bfsConcept,
  binarySearchConcept,
  blackHeightEqualConcept,
  bottleneckSetsFlowConcept,
  bottomUpTableConcept,
  boundAndCutConcept,
  branchAndBoundConcept,
  bstConcept,
  bstCompareAndGoConcept,
  bstDegenerateConcept,
  bstInorderSortedConcept,
  bubbleAdjacentSwapConcept,
  bubbleSortConcept,
  cachingCdnConcept,
  chainingBucketConcept,
  circularBufferWrapConcept,
  compareAndSwapConcept,
  conditionalStatementConcept,
  contextSwitchingConcept,
  countThenPlaceConcept,
  countingSortConcept,
  cycleBlocksOrderConcept,
  dbscanConcept,
  decisionBoundaryConcept,
  decisionTreeConcept,
  dendrogramCutConcept,
  denseNeighborhoodConcept,
  depthDoublesCountConcept,
  dequeBothEndsConcept,
  dfsConcept,
  digitByDigitConcept,
  dijkstraConcept,
  directionOfMostSpreadConcept,
  diveThenBacktrackConcept,
  divideConquerCombineConcept,
  dynamicProgrammingConcept,
  enqueueDequeueEndsConcept,
  fewerHopsNotShorterConcept,
  findRootConcept,
  floydWarshallConcept,
  gapShrinkConcept,
  globalAndLocalConcept,
  greedyConcept,
  greedyCanFailConcept,
  growAndCopyConcept,
  growOneTreeConcept,
  guessByValueConcept,
  halveTheRangeConcept,
  hashAvalancheConcept,
  hashChainConcept,
  hashFixedLengthConcept,
  hashIntegrityCheckConcept,
  hashSaltConcept,
  hashTableChainingConcept,
  hashToBucketConcept,
  heapBinaryConcept,
  heapPropertyConcept,
  heapSortConcept,
  heapSortExtractConcept,
  heightBalanceCheckConcept,
  heightStaysLowConcept,
  heuristicGuidesConcept,
  hierarchicalConcept,
  impurityDropsConcept,
  inPlaceVsExtraConcept,
  indegreeZeroFirstConcept,
  indexAddressCalcConcept,
  insertIntoSortedPartConcept,
  insertionSortConcept,
  interpolationSearchConcept,
  ipRoutingConcept,
  kChangesBoundaryConcept,
  kMustBeGivenConcept,
  keepNeighborsCloseConcept,
  kernelLiftsConcept,
  kmeansConcept,
  knnConcept,
  kruskalMstConcept,
  leastSquaresConcept,
  linearRegressionConcept,
  linearSearchConcept,
  linkedListSinglyConcept,
  loadFactorRehashConcept,
  logisticRegressionConcept,
  lostLinkConcept,
  lruCacheConcept,
  manyTreesVoteConcept,
  markVisitedOrLoopConcept,
  matrixTransform2dConcept,
  maxFlowConcept,
  memoWriteOnceConcept,
  mergeNearestPairConcept,
  mergeSortConcept,
  mergeTwoSortedConcept,
  merkleTreeConcept,
  messagingPubsubConcept,
  mutuallyReachableConcept,
  negativeEdgeBreaksConcept,
  nodeHoldsManyConcept,
  nodePointsNextConcept,
  noiseLeftOutConcept,
  oneMoreRoundDropsConcept,
  oneWayEdgeConcept,
  openAddressingProbeConcept,
  outOfBoundsConcept,
  overlappingSubproblemsConcept,
  parentTwoChildrenConcept,
  partitionAroundPivotConcept,
  pathCompressionConcept,
  pcaConcept,
  pickNearestUnsettledConcept,
  pigeonholeCollisionConcept,
  pivotChoiceMattersConcept,
  primMstConcept,
  projectAndLoseConcept,
  pruneBranchConcept,
  pushPopTopConcept,
  queueFifoConcept,
  queueVsStackOrderConcept,
  quickSortConcept,
  radixSortConcept,
  randomForestConcept,
  recolorThenRotateConcept,
  redBlackTreeConcept,
  relationalTablesAndKeysConcept,
  relaxShorterPathConcept,
  relinkInsertConcept,
  repeatRelaxAllConcept,
  requiresSortedConcept,
  residualDistanceConcept,
  rotateToBalanceConcept,
  scanUntilFoundConcept,
  sccConcept,
  selectMinEachPassConcept,
  selectionSortConcept,
  separateComponentsConcept,
  sharePrefixPathConcept,
  shellSortConcept,
  shiftOnInsertConcept,
  shiftOnRemoveConcept,
  siftDownConcept,
  siftUpConcept,
  signatureKeyDirectionConcept,
  signatureOnHashConcept,
  sortEdgesAvoidCycleConcept,
  sortStabilityConcept,
  splitByQuestionConcept,
  splitUntilOneConcept,
  splitWhenFullConcept,
  squashToProbabilityConcept,
  stackConcept,
  supportVectorsOnlyConcept,
  svmConcept,
  takeBestNowConcept,
  throughMiddleNodeConcept,
  tokenizationConcept,
  topologicalSortConcept,
  traversalOrderConcept,
  traverseFromHeadConcept,
  trieConcept,
  tryAndUndoConcept,
  tsneConcept,
  twoColorConflictConcept,
  undoByBackEdgeConcept,
  unionByRankConcept,
  unionFindConcept,
  voteByNeighborsConcept,
  walkPerCharacterConcept,
  widestMarginConcept,
];
