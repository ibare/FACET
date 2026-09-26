/**
 * 개념 선언 집합.
 *
 * 개념이 늘어나면 이 배열에 추가한다. facet 카탈로그(@ffacet/bootstrap)와의
 * 정합 — canonicalFacet 이 실재하는 facet id 인지 — 은
 * `test/concept-covers-facets.test.ts` 가 검사한다. 분야는 선언하지 않는다 —
 * canonicalFacet 으로 분류표에서 찾아 붙인다.
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
import { hybridSearchConcept } from './hybrid-search.js';
import { sameWordVsSameMeaningConcept } from './same-word-vs-same-meaning.js';
import { fuseTwoRankingsConcept } from './fuse-two-rankings.js';
import { adjacencyListVsMatrixConcept } from './adjacency-list-vs-matrix.js';
import { ahoCorasickConcept } from './aho-corasick.js';
import { allSuffixesSortedConcept } from './all-suffixes-sorted.js';
import { angleNotLengthConcept } from './angle-not-length.js';
import { arrayConcept } from './array.js';
import { arrayAsTreeConcept } from './array-as-tree.js';
import { assignThenMoveConcept } from './assign-then-move.js';
import { associativityReliefConcept } from './associativity-relief.js';
import { asymmetricRsaConcept } from './asymmetric-rsa.js';
import { asymptoticConcept } from './asymptotic.js';
import { averageTheBucketsConcept } from './average-the-buckets.js';
import { avlTreeConcept } from './avl-tree.js';
import { backwardTakenConcept } from './backward-taken.js';
import { bTreeConcept } from './b-tree.js';
import { backtrackingConcept } from './backtracking.js';
import { badCharSkipConcept } from './bad-char-skip.js';
import { baggingSampleConcept } from './bagging-sample.js';
import { bellmanFordConcept } from './bellman-ford.js';
import { betweenLetterAndWordConcept } from './between-letter-and-word.js';
import { bfsConcept } from './bfs.js';
import { bigOConcept } from './big-o.js';
import { binarySearchConcept } from './binary-search.js';
import { bitMaskConcept } from './bit-mask.js';
import { bitShiftConcept } from './bit-shift.js';
import { bitwiseOpsConcept } from './bitwise-ops.js';
import { blackHeightEqualConcept } from './black-height-equal.js';
import { bloomFilterConcept } from './bloom-filter.js';
import { bottleneckSetsFlowConcept } from './bottleneck-sets-flow.js';
import { bottomUpTableConcept } from './bottom-up-table.js';
import { boundAndCutConcept } from './bound-and-cut.js';
import { boundaryShiftConcept } from './boundary-shift.js';
import { boyerMooreConcept } from './boyer-moore.js';
import { bpeTrainingConcept } from './bpe-training.js';
import { branchAndBoundConcept } from './branch-and-bound.js';
import { branchFlushConcept } from './branch-flush.js';
import { branchHistoryTableConcept } from './branch-history-table.js';
import { patternFromHistoryConcept } from './pattern-from-history.js';
import { unpredictableBranchConcept } from './unpredictable-branch.js';
import { controlHazardConcept } from './control-hazard.js';
import { bstConcept } from './bst.js';
import { bstCompareAndGoConcept } from './bst-compare-and-go.js';
import { bstDegenerateConcept } from './bst-degenerate.js';
import { bstInorderSortedConcept } from './bst-inorder-sorted.js';
import { bubbleAdjacentSwapConcept } from './bubble-adjacent-swap.js';
import { bubbleSortConcept } from './bubble-sort.js';
import { byteOrderConcept } from './byte-order.js';
import { cacheLineConcept } from './cache-line.js';
import { cacheReplacementConcept } from './cache-replacement.js';
import { cachingCdnConcept } from './caching-cdn.js';
import { cannotUnsetConcept } from './cannot-unset.js';
import { chainingBucketConcept } from './chaining-bucket.js';
import { circularBufferWrapConcept } from './circular-buffer-wrap.js';
import { coarseThenFineConcept } from './coarse-then-fine.js';
import { coinFlipHeightConcept } from './coin-flip-height.js';
import { compareAndSwapConcept } from './compare-and-swap.js';
import { compareWithAllConcept } from './compare-with-all.js';
import { conditionalStatementConcept } from './conditional-statement.js';
import { conflictMissConcept } from './conflict-miss.js';
import { constantFadesConcept } from './constant-fades.js';
import { contextSwitchingConcept } from './context-switching.js';
import { countMinSketchConcept } from './count-min-sketch.js';
import { countThenPlaceConcept } from './count-then-place.js';
import { countingSortConcept } from './counting-sort.js';
import { crowdTheTailsConcept } from './crowd-the-tails.js';
import { curvesCrossConcept } from './curves-cross.js';
import { cycleBlocksOrderConcept } from './cycle-blocks-order.js';
import { dbscanConcept } from './dbscan.js';
import { dataHazardConcept } from './data-hazard.js';
import { decisionBoundaryConcept } from './decision-boundary.js';
import { decisionTreeConcept } from './decision-tree.js';
import { dendrogramCutConcept } from './dendrogram-cut.js';
import { denseNeighborhoodConcept } from './dense-neighborhood.js';
import { depthDoublesCountConcept } from './depth-doubles-count.js';
import { dequeBothEndsConcept } from './deque-both-ends.js';
import { dfsConcept } from './dfs.js';
import { digitByDigitConcept } from './digit-by-digit.js';
import { dijkstraConcept } from './dijkstra.js';
import { directMappedCacheConcept } from './direct-mapped-cache.js';
import { directionOfMostSpreadConcept } from './direction-of-most-spread.js';
import { diveThenBacktrackConcept } from './dive-then-backtrack.js';
import { divideConquerCombineConcept } from './divide-conquer-combine.js';
import { draftThenVerifyConcept } from './draft-then-verify.js';
import { dualIssueConcept } from './dual-issue.js';
import { divisorPairsSqrtConcept } from './divisor-pairs-sqrt.js';
import { dynamicProgrammingConcept } from './dynamic-programming.js';
import { editDistanceConcept } from './edit-distance.js';
import { editTableFillConcept } from './edit-table-fill.js';
import { enqueueDequeueEndsConcept } from './enqueue-dequeue-ends.js';
import { euclideanConcept } from './euclidean.js';
import { exhaustiveSearchConcept } from './exhaustive-search.js';
import { failLinkConcept } from './fail-link.js';
import { falseSharingConcept } from './false-sharing.js';
import { fastPowerConcept } from './fast-power.js';
import { fetchAheadConcept } from './fetch-ahead.js';
import { fewerHopsNotShorterConcept } from './fewer-hops-not-shorter.js';
import { fieldOrderSizeConcept } from './field-order-size.js';
import { findRootConcept } from './find-root.js';
import { fiveStagePipelineConcept } from './five-stage-pipeline.js';
import { floatingPointConcept } from './floating-point.js';
import { floydWarshallConcept } from './floyd-warshall.js';
import { fourStateHysteresisConcept } from './four-state-hysteresis.js';
import { gapShrinkConcept } from './gap-shrink.js';
import { globalAndLocalConcept } from './global-and-local.js';
import { greedyConcept } from './greedy.js';
import { greedyCanFailConcept } from './greedy-can-fail.js';
import { greedyDecodingConcept } from './greedy-decoding.js';
import { alwaysTheHighestConcept } from './always-the-highest.js';
import { growAndCopyConcept } from './grow-and-copy.js';
import { growOneTreeConcept } from './grow-one-tree.js';
import { growthOutpacesConcept } from './growth-outpaces.js';
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
import { hnswConcept } from './hnsw.js';
import { beamSearchConcept } from './beam-search.js';
import { carrySeveralLinesConcept } from './carry-several-lines.js';
import { eraseTheImpossibleConcept } from './erase-the-impossible.js';
import { hyperloglogConcept } from './hyperloglog.js';
import { impurityDropsConcept } from './impurity-drops.js';
import { inPlaceVsExtraConcept } from './in-place-vs-extra.js';
import { indegreeZeroFirstConcept } from './indegree-zero-first.js';
import { indexAddressCalcConcept } from './index-address-calc.js';
import { indexAndTagConcept } from './index-and-tag.js';
import { insertIntoSortedPartConcept } from './insert-into-sorted-part.js';
import { insertionSortConcept } from './insertion-sort.js';
import { integerOverflowConcept } from './integer-overflow.js';
import { interpolationSearchConcept } from './interpolation-search.js';
import { invertedFileIndexConcept } from './inverted-file-index.js';
import { ipRoutingConcept } from './ip-routing.js';
import { kChangesBoundaryConcept } from './k-changes-boundary.js';
import { kMustBeGivenConcept } from './k-must-be-given.js';
import { keepNeighborsCloseConcept } from './keep-neighbors-close.js';
import { kernelLiftsConcept } from './kernel-lifts.js';
import { kmeansConcept } from './kmeans.js';
import { kmpConcept } from './kmp.js';
import { knnConcept } from './knn.js';
import { kruskalMstConcept } from './kruskal-mst.js';
import { lanesInStepConcept } from './lanes-in-step.js';
import { latencyLadderConcept } from './latency-ladder.js';
import { leadingZerosTellConcept } from './leading-zeros-tell.js';
import { leastSquaresConcept } from './least-squares.js';
import { lineFillConcept } from './line-fill.js';
import { linearRegressionConcept } from './linear-regression.js';
import { linearSearchConcept } from './linear-search.js';
import { linkedListSinglyConcept } from './linked-list-singly.js';
import { loadFactorRehashConcept } from './load-factor-rehash.js';
import { logisticRegressionConcept } from './logistic-regression.js';
import { lookCloselyAtFewConcept } from './look-closely-at-few.js';
import { lostLinkConcept } from './lost-link.js';
import { lruCacheConcept } from './lru-cache.js';
import { mantissaAndExponentConcept } from './mantissa-and-exponent.js';
import { manyPatternsOnePassConcept } from './many-patterns-one-pass.js';
import { manyTreesVoteConcept } from './many-trees-vote.js';
import { markVisitedOrLoopConcept } from './mark-visited-or-loop.js';
import { matchFromBackConcept } from './match-from-back.js';
import { matchLengthPerSpotConcept } from './match-length-per-spot.js';
import { matrixMulConcept } from './matrix-mul.js';
import { matrixTransform2dConcept } from './matrix-transform-2d.js';
import { maxFlowConcept } from './max-flow.js';
import { memoWriteOnceConcept } from './memo-write-once.js';
import { mergeNearestPairConcept } from './merge-nearest-pair.js';
import { mergeSortConcept } from './merge-sort.js';
import { mergeTheFrequentPairConcept } from './merge-the-frequent-pair.js';
import { mergeTwoSortedConcept } from './merge-two-sorted.js';
import { merkleTreeConcept } from './merkle-tree.js';
import { messagingPubsubConcept } from './messaging-pubsub.js';
import { mispredictionPenaltyConcept } from './misprediction-penalty.js';
import { mutuallyReachableConcept } from './mutually-reachable.js';
import { naiveShiftByOneConcept } from './naive-shift-by-one.js';
import { negateAndAddOneConcept } from './negate-and-add-one.js';
import { negativeEdgeBreaksConcept } from './negative-edge-breaks.js';
import { neighborsLinkedAheadConcept } from './neighbors-linked-ahead.js';
import { nodeHoldsManyConcept } from './node-holds-many.js';
import { nodePointsNextConcept } from './node-points-next.js';
import { noiseLeftOutConcept } from './noise-left-out.js';
import { oneBitDoubleFaultConcept } from './one-bit-double-fault.js';
import { oneMoreRoundDropsConcept } from './one-more-round-drops.js';
import { oneWayEdgeConcept } from './one-way-edge.js';
import { openAddressingProbeConcept } from './open-addressing-probe.js';
import { operandForwardingConcept } from './operand-forwarding.js';
import { outOfBoundsConcept } from './out-of-bounds.js';
import { outOfOrderExecutionConcept } from './out-of-order-execution.js';
import { overlappingSubproblemsConcept } from './overlapping-subproblems.js';
import { pNpConcept } from './p-np.js';
import { parentTwoChildrenConcept } from './parent-two-children.js';
import { partitionAroundPivotConcept } from './partition-around-pivot.js';
import { pathCompressionConcept } from './path-compression.js';
import { paddingGapConcept } from './padding-gap.js';
import { pcaConcept } from './pca.js';
import { pickNearestUnsettledConcept } from './pick-nearest-unsettled.js';
import { pigeonholeCollisionConcept } from './pigeonhole-collision.js';
import { pipelineBubbleConcept } from './pipeline-bubble.js';
import { pivotChoiceMattersConcept } from './pivot-choice-matters.js';
import { positionalValueConcept } from './positional-value.js';
import { prefetchingConcept } from './prefetching.js';
import { prefixSuffixJumpConcept } from './prefix-suffix-jump.js';
import { primMstConcept } from './prim-mst.js';
import { primalityConcept } from './primality.js';
import { probeAFewCellsConcept } from './probe-a-few-cells.js';
import { productQuantizationConcept } from './product-quantization.js';
import { projectAndLoseConcept } from './project-and-lose.js';
import { pruneBranchConcept } from './prune-branch.js';
import { pushPopTopConcept } from './push-pop-top.js';
import { queueFifoConcept } from './queue.js';
import { queueVsStackOrderConcept } from './queue-vs-stack-order.js';
import { quickSortConcept } from './quick-sort.js';
import { rabinKarpConcept } from './rabin-karp.js';
import { readyFirstConcept } from './ready-first.js';
import { radixSortConcept } from './radix-sort.js';
import { randomForestConcept } from './random-forest.js';
import { readBeforeWriteConcept } from './read-before-write.js';
import { recallSpeedTradeoffConcept } from './recall-speed-tradeoff.js';
import { recolorThenRotateConcept } from './recolor-then-rotate.js';
import { redBlackTreeConcept } from './red-black-tree.js';
import { reduceToKnownConcept } from './reduce-to-known.js';
import { relationalTablesAndKeysConcept } from './relational-tables-and-keys.js';
import { normalFormsConcept } from './normal-forms.js';
import { updateAnomalyConcept } from './update-anomaly.js';
import { atomicCellConcept } from './atomic-cell.js';
import { partialDependencyConcept } from './partial-dependency.js';
import { transitiveDependencyConcept } from './transitive-dependency.js';
import { determinantMustBeKeyConcept } from './determinant-must-be-key.js';
import { primaryKeyIdentifiesConcept } from './primary-key-identifies.js';
import { foreignKeyPointsConcept } from './foreign-key-points.js';
import { rowIsAFactConcept } from './row-is-a-fact.js';
import { setOfRowsConcept } from './set-of-rows.js';
import { relaxShorterPathConcept } from './relax-shorter-path.js';
import { relinkInsertConcept } from './relink-insert.js';
import { rerankingConcept } from './reranking.js';
import { repeatRelaxAllConcept } from './repeat-relax-all.js';
import { requiresSortedConcept } from './requires-sorted.js';
import { residualDistanceConcept } from './residual-distance.js';
import { rollingHashConcept } from './rolling-hash.js';
import { rotateToBalanceConcept } from './rotate-to-balance.js';
import { rowTimesColumnConcept } from './row-times-column.js';
import { saturatingCounterConcept } from './saturating-counter.js';
import { scanUntilFoundConcept } from './scan-until-found.js';
import { sccConcept } from './scc.js';
import { selectMinEachPassConcept } from './select-min-each-pass.js';
import { selectionSortConcept } from './selection-sort.js';
import { separateComponentsConcept } from './separate-components.js';
import { setAssociativeCacheConcept } from './set-associative-cache.js';
import { severalHashesOneValueConcept } from './several-hashes-one-value.js';
import { sharePrefixPathConcept } from './share-prefix-path.js';
import { shellSortConcept } from './shell-sort.js';
import { shiftOnInsertConcept } from './shift-on-insert.js';
import { shiftOnRemoveConcept } from './shift-on-remove.js';
import { sieveConcept } from './sieve.js';
import { siftDownConcept } from './sift-down.js';
import { siftUpConcept } from './sift-up.js';
import { simdConcept } from './simd.js';
import { signatureKeyDirectionConcept } from './signature-key-direction.js';
import { signatureOnHashConcept } from './signature-on-hash.js';
import { signedWraparoundConcept } from './signed-wraparound.js';
import { silentTruncationConcept } from './silent-truncation.js';
import { skipALayerConcept } from './skip-a-layer.js';
import { skipListConcept } from './skip-list.js';
import { sortEdgesAvoidCycleConcept } from './sort-edges-avoid-cycle.js';
import { sortStabilityConcept } from './sort-stability.js';
import { spaceErrorTradeoffConcept } from './space-error-tradeoff.js';
import { spaceIsPartOfItConcept } from './space-is-part-of-it.js';
import { spatialLocalityConcept } from './spatial-locality.js';
import { speculativeDecodingConcept } from './speculative-decoding.js';
import { splitAndNumberConcept } from './split-and-number.js';
import { splitByQuestionConcept } from './split-by-question.js';
import { splitUntilOneConcept } from './split-until-one.js';
import { splitWhenFullConcept } from './split-when-full.js';
import { squareAndHalveConcept } from './square-and-halve.js';
import { squashToProbabilityConcept } from './squash-to-probability.js';
import { stackConcept } from './stack.js';
import { stageOverlapConcept } from './stage-overlap.js';
import { staticPredictionConcept } from './static-prediction.js';
import { structAlignmentConcept } from './struct-alignment.js';
import { subwordSegmentationConcept } from './subword-segmentation.js';
import { suffixArrayConcept } from './suffix-array.js';
import { supportVectorsOnlyConcept } from './support-vectors-only.js';
import { svmConcept } from './svm.js';
import { tDigestConcept } from './t-digest.js';
import { takeBestNowConcept } from './take-best-now.js';
import { temperatureSamplingConcept } from './temperature-sampling.js';
import { flattenOrSharpenConcept } from './flatten-or-sharpen.js';
import { penalizeRepeatsConcept } from './penalize-repeats.js';
import { temporalLocalityConcept } from './temporal-locality.js';
import { threeEditChoicesConcept } from './three-edit-choices.js';
import { throughMiddleNodeConcept } from './through-middle-node.js';
import { throughputNotLatencyConcept } from './throughput-not-latency.js';
import { tokenizationConcept } from './tokenization.js';
import { tokensPerLanguageConcept } from './tokens-per-language.js';
import { kvCacheConcept } from './kv-cache.js';
import { dontRecountThePastConcept } from './dont-recount-the-past.js';
import { cacheKeepsGrowingConcept } from './cache-keeps-growing.js';
import { firstTokenVsRestConcept } from './first-token-vs-rest.js';
import { topKTopPConcept } from './top-k-top-p.js';
import { cutTheTailConcept } from './cut-the-tail.js';
import { fillToAShareConcept } from './fill-to-a-share.js';
import { contextAssemblyConcept } from './context-assembly.js';
import { budgetRunsOutConcept } from './budget-runs-out.js';
import { lostInTheMiddleConcept } from './lost-in-the-middle.js';
import { topologicalSortConcept } from './topological-sort.js';
import { traversalOrderConcept } from './traversal-order.js';
import { traverseFromHeadConcept } from './traverse-from-head.js';
import { trieConcept } from './trie.js';
import { trustTheSmallestConcept } from './trust-the-smallest.js';
import { tryAndUndoConcept } from './try-and-undo.js';
import { tsneConcept } from './tsne.js';
import { twoColorConflictConcept } from './two-color-conflict.js';
import { twosComplementConcept } from './twos-complement.js';
import { undoByBackEdgeConcept } from './undo-by-back-edge.js';
import { unevenFloatGapsConcept } from './uneven-float-gaps.js';
import { unionByRankConcept } from './union-by-rank.js';
import { unionFindConcept } from './union-find.js';
import { unknownBecomesKnownConcept } from './unknown-becomes-known.js';
import { unrepresentableFractionConcept } from './unrepresentable-fraction.js';
import { vectorSimilarityConcept } from './vector-similarity.js';
import { verifyVsFindConcept } from './verify-vs-find.js';
import { vocabularyConcept } from './vocabulary.js';
import { voteByNeighborsConcept } from './vote-by-neighbors.js';
import { walkPerCharacterConcept } from './walk-per-character.js';
import { widestMarginConcept } from './widest-margin.js';
import { writeBackVsThroughConcept } from './write-back-vs-through.js';
import { writePolicyConcept } from './write-policy.js';
import { wrongInOneDirectionConcept } from './wrong-in-one-direction.js';
import { zAlgorithmConcept } from './z-algorithm.js';
import { arrayTraversalOrderConcept } from './array-traversal-order.js';
import { rowVsColumnWalkConcept } from './row-vs-column-walk.js';
import { strideAndMissConcept } from './stride-and-miss.js';
import { chunkingConcept } from './chunking.js';
import { whereToCutConcept } from './where-to-cut.js';
import { overlapTheSeamConcept } from './overlap-the-seam.js';
import { batchingAndPaddingConcept } from './batching-and-padding.js';
import { shortWaitsForLongConcept } from './short-waits-for-long.js';
import { refillTheEmptySlotConcept } from './refill-the-empty-slot.js';
import { branchTakeOnePathConcept } from './branch-take-one-path.js';
import { multiwayBranchConcept } from './multiway-branch.js';
import { loopBackConcept } from './loop-back.js';
import { loopTerminationConcept } from './loop-termination.js';
import { recursionSelfCallConcept } from './recursion-self-call.js';
import { callStackUnwindConcept } from './call-stack-unwind.js';
import { baseCaseConcept } from './base-case.js';
import { exceptionPropagateConcept } from './exception-propagate.js';
import { passByValueVsReferenceConcept } from './pass-by-value-vs-reference.js';
import { returnToCallerConcept } from './return-to-caller.js';
import { closureCapturesConcept } from './closure-captures.js';
import { functionAsValueConcept } from './function-as-value.js';
import { curryingPartialConcept } from './currying-partial.js';
import { valueInPlaceConcept } from './value-in-place.js';
import { referenceHoldsAddressConcept } from './reference-holds-address.js';
import { aliasingConcept } from './aliasing.js';
import { narrowingLossConcept } from './narrowing-loss.js';
import { shadowingConcept } from './shadowing.js';
import { scopeExitConcept } from './scope-exit.js';
import { danglingReferenceConcept } from './dangling-reference.js';
import { stackVsHeapConcept } from './stack-vs-heap.js';
import { pointerDereferenceConcept } from './pointer-dereference.js';
import { gcReachableFromRootConcept } from './gc-reachable-from-root.js';
import { refcountZeroConcept } from './refcount-zero.js';
import { referenceCycleConcept } from './reference-cycle.js';
import { manualFreeConcept } from './manual-free.js';
import { doubleFreeConcept } from './double-free.js';
import { memoryLeakConcept } from './memory-leak.js';
import { tracingVsRefcountConcept } from './tracing-vs-refcount.js';
import { allocateAndFreeConcept } from './allocate-and-free.js';
import { loopVsRecursionConcept } from './loop-vs-recursion.js';
import { copyVsShareConcept } from './copy-vs-share.js';
import { pureSameOutputConcept } from './pure-same-output.js';
import { noSideEffectConcept } from './no-side-effect.js';
import { immutableCopyConcept } from './immutable-copy.js';
import { mapOneByOneConcept } from './map-one-by-one.js';
import { filterKeepSomeConcept } from './filter-keep-some.js';
import { reduceFoldConcept } from './reduce-fold.js';
import { monadChainInBoxConcept } from './monad-chain-in-box.js';
import { instantiateFromClassConcept } from './instantiate-from-class.js';
import { methodLookupUpConcept } from './method-lookup-up.js';
import { dynamicDispatchConcept } from './dynamic-dispatch.js';
import { interfaceSlotConcept } from './interface-slot.js';
import { encapsulationBoundaryConcept } from './encapsulation-boundary.js';
import { polymorphismConcept } from './polymorphism.js';
import { pureFunctionConcept } from './pure-function.js';
import { mapFilterReduceConcept } from './map-filter-reduce.js';
import { fileBlockPlacementConcept } from './file-block-placement.js';
import { inodePointsBlocksConcept } from './inode-points-blocks.js';
import { indirectBlockConcept } from './indirect-block.js';
import { chainOfBlocksConcept } from './chain-of-blocks.js';
import { pathResolutionConcept } from './path-resolution.js';
import { hardVsSoftLinkConcept } from './hard-vs-soft-link.js';
import { journalingConcept } from './journaling.js';
import { writeIntentFirstConcept } from './write-intent-first.js';
import { replayAfterCrashConcept } from './replay-after-crash.js';
import { ioTransferModesConcept } from './io-transfer-modes.js';
import { transferWithoutCpuConcept } from './transfer-without-cpu.js';
import { interruptPreemptsConcept } from './interrupt-preempts.js';
import { pollingVsInterruptConcept } from './polling-vs-interrupt.js';
import { diskSchedulingConcept } from './disk-scheduling.js';
import { seekDistanceCostsConcept } from './seek-distance-costs.js';
import { elevatorSweepConcept } from './elevator-sweep.js';
import { schedulingPolicyConcept } from './scheduling-policy.js';
import { roundRobinQuantumConcept } from './round-robin-quantum.js';
import { priorityAgingConcept } from './priority-aging.js';
import { weightedFairShareConcept } from './weighted-fair-share.js';
import { readyQueuePickConcept } from './ready-queue-pick.js';
import { turnaroundVsWaitConcept } from './turnaround-vs-wait.js';
import { firstComeFirstRunConcept } from './first-come-first-run.js';
import { convoyEffectConcept } from './convoy-effect.js';
import { shortestFirstConcept } from './shortest-first.js';
import { starvationOfLongConcept } from './starvation-of-long.js';
import { demoteOnOveruseConcept } from './demote-on-overuse.js';
import { timeSliceRotateConcept } from './time-slice-rotate.js';
import { quantumSizeTradeoffConcept } from './quantum-size-tradeoff.js';
import { priorityPreemptConcept } from './priority-preempt.js';
import { agingConcept } from './aging.js';
import { virtualRuntimeConcept } from './virtual-runtime.js';
import { pagingConcept } from './paging.js';
import { pageTableLookupConcept } from './page-table-lookup.js';
import { fixedSizeFramesConcept } from './fixed-size-frames.js';
import { tlbCachesTranslationConcept } from './tlb-caches-translation.js';
import { segmentationConcept } from './segmentation.js';
import { variableSizeSegmentsConcept } from './variable-size-segments.js';
import { externalFragmentationConcept } from './external-fragmentation.js';
import { virtualMemoryConcept } from './virtual-memory.js';
import { pageFaultConcept } from './page-fault.js';
import { swapInOutConcept } from './swap-in-out.js';
import { thrashingConcept } from './thrashing.js';
import { pageReplacementConcept } from './page-replacement.js';
import { evictLeastRecentConcept } from './evict-least-recent.js';
import { recencyReorderConcept } from './recency-reorder.js';
import { evictOldestConcept } from './evict-oldest.js';
import { beladyAnomalyConcept } from './belady-anomaly.js';
import { secondChanceConcept } from './second-chance.js';
import { processStateConcept } from './process-state.js';
import { stateTransitionsConcept } from './state-transitions.js';
import { blockedWaitsEventConcept } from './blocked-waits-event.js';
import { pcbHoldsStateConcept } from './pcb-holds-state.js';
import { saveAndRestoreConcept } from './save-and-restore.js';
import { switchCostsConcept } from './switch-costs.js';
import { mutexConcept } from './mutex.js';
import { interleavingConcept } from './interleaving.js';
import { nonAtomicIncrementConcept } from './non-atomic-increment.js';
import { lostUpdateConcept } from './lost-update.js';
import { criticalSectionConcept } from './critical-section.js';
import { lockExcludesConcept } from './lock-excludes.js';
import { deadlockConcept } from './deadlock.js';
import { holdAndWaitConcept } from './hold-and-wait.js';
import { noPreemptionConcept } from './no-preemption.js';
import { waitCycleConcept } from './wait-cycle.js';
import { lockOrderingConcept } from './lock-ordering.js';
import { producerConsumerConcept } from './producer-consumer.js';
import { countingPermitsConcept } from './counting-permits.js';
import { waitAndSignalConcept } from './wait-and-signal.js';
import { boundedBufferConcept } from './bounded-buffer.js';
import { tcpHandshakeConcept } from './tcp-handshake.js';
import { threeWaySyncConcept } from './three-way-sync.js';
import { sequenceNumberConcept } from './sequence-number.js';
import { sendAndForgetConcept } from './send-and-forget.js';
import { portDemultiplexConcept } from './port-demultiplex.js';
import { controlAndDataChannelConcept } from './control-and-data-channel.js';
import { congestionControlConcept } from './congestion-control.js';
import { receiverWindowConcept } from './receiver-window.js';
import { slowStartConcept } from './slow-start.js';
import { backOffOnLossConcept } from './back-off-on-loss.js';
import { sawtoothConcept } from './sawtooth.js';
import { ripConcept } from './rip.js';
import { natConcept } from './nat.js';
import { firewallConcept } from './firewall.js';
import { hopCountMetricConcept } from './hop-count-metric.js';
import { countToInfinityConcept } from './count-to-infinity.js';
import { linkStateFloodConcept } from './link-state-flood.js';
import { shortestPathTreeConcept } from './shortest-path-tree.js';
import { pathVectorPolicyConcept } from './path-vector-policy.js';
import { rewriteAddressPortConcept } from './rewrite-address-port.js';
import { natMappingTableConcept } from './nat-mapping-table.js';
import { ruleMatchOrderConcept } from './rule-match-order.js';
import { longestPrefixMatchConcept } from './longest-prefix-match.js';
import { forwardingTableConcept } from './forwarding-table.js';
import { echoAndReplyConcept } from './echo-and-reply.js';
import { ttlExpiredReportsConcept } from './ttl-expired-reports.js';
import { physicalLayerConcept } from './physical-layer.js';
import { bitsAsSignalConcept } from './bits-as-signal.js';
import { frameBoundaryConcept } from './frame-boundary.js';
import { networkLayerConcept } from './network-layer.js';
import { layerWrapsPayloadConcept } from './layer-wraps-payload.js';
import { peerLayerTalkConcept } from './peer-layer-talk.js';
import { hopByHopConcept } from './hop-by-hop.js';
import { storeAndForwardConcept } from './store-and-forward.js';
import { ethernetConcept } from './ethernet.js';
import { collisionAndBackoffConcept } from './collision-and-backoff.js';
import { arpConcept } from './arp.js';
import { askWhoHasConcept } from './ask-who-has.js';
import { arpCacheConcept } from './arp-cache.js';
import { macIsLocalConcept } from './mac-is-local.js';
import { httpConcept } from './http.js';
import { requestResponseConcept } from './request-response.js';
import { statelessNeedsTokenConcept } from './stateless-needs-token.js';
import { upgradeThenKeepOpenConcept } from './upgrade-then-keep-open.js';
import { dnsConcept } from './dns.js';
import { delegateDownTheTreeConcept } from './delegate-down-the-tree.js';
import { cacheTtlConcept } from './cache-ttl.js';
import { tlsHandshakeConcept } from './tls-handshake.js';
import { sharedSecretInPublicConcept } from './shared-secret-in-public.js';
import { certificateChainConcept } from './certificate-chain.js';
import { authConcept } from './auth.js';
import { tokenBearerConcept } from './token-bearer.js';
import { documentKvConcept } from './document-kv.js';
import { nestedDocumentConcept } from './nested-document.js';
import { keyToValueConcept } from './key-to-value.js';
import { columnFamilyConcept } from './column-family.js';
import { columnOrientedConcept } from './column-oriented.js';
import { graphDbConcept } from './graph-db.js';
import { traverseRelationshipsConcept } from './traverse-relationships.js';
import { dmlConcept } from './dml.js';
import { joinKindsConcept } from './join-kinds.js';
import { subqueryConcept } from './subquery.js';
import { windowFunctionConcept } from './window-function.js';
import { insertUpdateDeleteConcept } from './insert-update-delete.js';
import { schemaDefinesShapeConcept } from './schema-defines-shape.js';
import { matchOnKeyConcept } from './match-on-key.js';
import { keepUnmatchedConcept } from './keep-unmatched.js';
import { allPairsConcept } from './all-pairs.js';
import { queryInsideQueryConcept } from './query-inside-query.js';
import { windowSlidesConcept } from './window-slides.js';
import { groupThenAggregateConcept } from './group-then-aggregate.js';
import { acidConcept } from './acid.js';
import { allOrNothingConcept } from './all-or-nothing.js';
import { durableAfterCommitConcept } from './durable-after-commit.js';
import { isolationConcept } from './isolation.js';
import { dirtyReadConcept } from './dirty-read.js';
import { nonRepeatableReadConcept } from './non-repeatable-read.js';
import { phantomReadConcept } from './phantom-read.js';
import { sharedVsExclusiveConcept } from './shared-vs-exclusive.js';
import { lockWaitConcept } from './lock-wait.js';
import { growThenShrinkConcept } from './grow-then-shrink.js';
import { mvccConcept } from './mvcc.js';
import { keepOldVersionConcept } from './keep-old-version.js';
import { readSeesSnapshotConcept } from './read-sees-snapshot.js';
import { replicationConcept } from './replication.js';
import { copyToFollowersConcept } from './copy-to-followers.js';
import { replicationLagConcept } from './replication-lag.js';
import { partitionForcesChoiceConcept } from './partition-forces-choice.js';
import { shardingConcept } from './sharding.js';
import { splitByKeyConcept } from './split-by-key.js';
import { hotShardConcept } from './hot-shard.js';
import { raftConcept } from './raft.js';
import { electALeaderConcept } from './elect-a-leader.js';
import { majorityDecidesConcept } from './majority-decides.js';
import { logReplicateInOrderConcept } from './log-replicate-in-order.js';
import { splitBrainConcept } from './split-brain.js';
import { paxosConcept } from './paxos.js';
import { proposeAndPromiseConcept } from './propose-and-promise.js';
import { indexChoiceConcept } from './index-choice.js';
import { leavesLinkedConcept } from './leaves-linked.js';
import { allDataInLeavesConcept } from './all-data-in-leaves.js';
import { indexCostsWriteConcept } from './index-costs-write.js';
import { exactMatchOnlyConcept } from './exact-match-only.js';
import { bitmapIndexConcept } from './bitmap-index.js';
import { bitPerRowConcept } from './bit-per-row.js';
import { bitwiseCombineConcept } from './bitwise-combine.js';
import { compositeIndexConcept } from './composite-index.js';
import { leftmostPrefixConcept } from './leftmost-prefix.js';
import { optimizerConcept } from './optimizer.js';
import { sameAnswerDifferentPlanConcept } from './same-answer-different-plan.js';
import { reorderJoinsConcept } from './reorder-joins.js';
import { planIsATreeConcept } from './plan-is-a-tree.js';
import { costModelConcept } from './cost-model.js';
import { estimateFromStatsConcept } from './estimate-from-stats.js';
import { badEstimateBadPlanConcept } from './bad-estimate-bad-plan.js';
import { cascadePriorityConcept } from './cascade-priority.js';
import { selectorRightToLeftConcept } from './selector-right-to-left.js';
import { cascadeConflictConcept } from './cascade-conflict.js';
import { layoutThrashConcept } from './layout-thrash.js';
import { forcedSyncLayoutConcept } from './forced-sync-layout.js';
import { oneGrowsRestShiftConcept } from './one-grows-rest-shift.js';
import { repaintCostConcept } from './repaint-cost.js';
import { stackOfSheetsConcept } from './stack-of-sheets.js';
import { layerPromotionConcept } from './layer-promotion.js';
import { keyedReconciliationConcept } from './keyed-reconciliation.js';
import { sideBySideTreesConcept } from './side-by-side-trees.js';
import { typeChangeRebuildConcept } from './type-change-rebuild.js';
import { missingKeyRemountConcept } from './missing-key-remount.js';
import { keyReorderConcept } from './key-reorder.js';
import { reactiveUpdatesConcept } from './reactive-updates.js';
import { readIsSubscribeConcept } from './read-is-subscribe.js';
import { dirtyScanConcept } from './dirty-scan.js';
import { coalesceUpdatesConcept } from './coalesce-updates.js';
import { cooperativeYieldingConcept } from './cooperative-yielding.js';
import { longTaskBlocksConcept } from './long-task-blocks.js';
import { yieldToRenderConcept } from './yield-to-render.js';
import { microtaskStarvationConcept } from './microtask-starvation.js';
import { frameBudgetConcept } from './frame-budget.js';
import { layoutPerFrameConcept } from './layout-per-frame.js';
import { moveWithoutRepaintConcept } from './move-without-repaint.js';
import { sixteenMillisecondsConcept } from './sixteen-milliseconds.js';
import { droppedFrameConcept } from './dropped-frame.js';
import { criticalPathConcept } from './critical-path.js';
import { parserStopsConcept } from './parser-stops.js';
import { deferVsAsyncConcept } from './defer-vs-async.js';
import { styleBlocksPaintConcept } from './style-blocks-paint.js';
import { preloadHintConcept } from './preload-hint.js';
import { fontSwapConcept } from './font-swap.js';
import { whatFirstPaintNeedsConcept } from './what-first-paint-needs.js';
import { framesStackUpConcept } from './frames-stack-up.js';
import { oneTurnAtATimeConcept } from './one-turn-at-a-time.js';
import { timerIsAFloorConcept } from './timer-is-a-floor.js';
import { microtaskCutsInConcept } from './microtask-cuts-in.js';
import { twoTreesMeetConcept } from './two-trees-meet.js';
import { justBeforePaintConcept } from './just-before-paint.js';
import { jankVsSlowConcept } from './jank-vs-slow.js';

export const CONCEPT_SOURCES: readonly FacetConceptSource[] = [
  adjacencyListVsMatrixConcept,
  ahoCorasickConcept,
  allSuffixesSortedConcept,
  angleNotLengthConcept,
  arrayAsTreeConcept,
  arrayConcept,
  assignThenMoveConcept,
  associativityReliefConcept,
  asymmetricRsaConcept,
  asymptoticConcept,
  averageTheBucketsConcept,
  avlTreeConcept,
  backtrackingConcept,
  backwardTakenConcept,
  badCharSkipConcept,
  baggingSampleConcept,
  bellmanFordConcept,
  betweenLetterAndWordConcept,
  bfsConcept,
  bigOConcept,
  binarySearchConcept,
  bitMaskConcept,
  bitShiftConcept,
  bitwiseOpsConcept,
  blackHeightEqualConcept,
  bloomFilterConcept,
  bottleneckSetsFlowConcept,
  bottomUpTableConcept,
  boundAndCutConcept,
  boundaryShiftConcept,
  boyerMooreConcept,
  bpeTrainingConcept,
  branchAndBoundConcept,
  branchFlushConcept,
  branchHistoryTableConcept,
  patternFromHistoryConcept,
  unpredictableBranchConcept,
  controlHazardConcept,
  bstCompareAndGoConcept,
  bstConcept,
  bstDegenerateConcept,
  bstInorderSortedConcept,
  bTreeConcept,
  bubbleAdjacentSwapConcept,
  bubbleSortConcept,
  byteOrderConcept,
  cacheLineConcept,
  cacheReplacementConcept,
  cachingCdnConcept,
  cannotUnsetConcept,
  chainingBucketConcept,
  circularBufferWrapConcept,
  coarseThenFineConcept,
  coinFlipHeightConcept,
  compareAndSwapConcept,
  compareWithAllConcept,
  conditionalStatementConcept,
  conflictMissConcept,
  constantFadesConcept,
  contextSwitchingConcept,
  countingSortConcept,
  countMinSketchConcept,
  countThenPlaceConcept,
  crowdTheTailsConcept,
  curvesCrossConcept,
  cycleBlocksOrderConcept,
  dbscanConcept,
  dataHazardConcept,
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
  directMappedCacheConcept,
  diveThenBacktrackConcept,
  divideConquerCombineConcept,
  draftThenVerifyConcept,
  dualIssueConcept,
  divisorPairsSqrtConcept,
  dynamicProgrammingConcept,
  editDistanceConcept,
  editTableFillConcept,
  enqueueDequeueEndsConcept,
  euclideanConcept,
  exhaustiveSearchConcept,
  failLinkConcept,
  falseSharingConcept,
  fastPowerConcept,
  fetchAheadConcept,
  fewerHopsNotShorterConcept,
  findRootConcept,
  fiveStagePipelineConcept,
  floatingPointConcept,
  floydWarshallConcept,
  fourStateHysteresisConcept,
  gapShrinkConcept,
  globalAndLocalConcept,
  greedyCanFailConcept,
  greedyConcept,
  greedyDecodingConcept,
  alwaysTheHighestConcept,
  growAndCopyConcept,
  growOneTreeConcept,
  growthOutpacesConcept,
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
  hnswConcept,
  beamSearchConcept,
  carrySeveralLinesConcept,
  eraseTheImpossibleConcept,
  hyperloglogConcept,
  impurityDropsConcept,
  indegreeZeroFirstConcept,
  indexAddressCalcConcept,
  indexAndTagConcept,
  inPlaceVsExtraConcept,
  insertIntoSortedPartConcept,
  insertionSortConcept,
  integerOverflowConcept,
  interpolationSearchConcept,
  invertedFileIndexConcept,
  ipRoutingConcept,
  kChangesBoundaryConcept,
  keepNeighborsCloseConcept,
  kernelLiftsConcept,
  kmeansConcept,
  kmpConcept,
  kMustBeGivenConcept,
  knnConcept,
  kruskalMstConcept,
  lanesInStepConcept,
  latencyLadderConcept,
  leadingZerosTellConcept,
  leastSquaresConcept,
  linearRegressionConcept,
  linearSearchConcept,
  lineFillConcept,
  linkedListSinglyConcept,
  loadFactorRehashConcept,
  logisticRegressionConcept,
  lookCloselyAtFewConcept,
  lostLinkConcept,
  lruCacheConcept,
  mantissaAndExponentConcept,
  manyPatternsOnePassConcept,
  manyTreesVoteConcept,
  markVisitedOrLoopConcept,
  matchFromBackConcept,
  matchLengthPerSpotConcept,
  matrixMulConcept,
  matrixTransform2dConcept,
  maxFlowConcept,
  memoWriteOnceConcept,
  mergeNearestPairConcept,
  mergeSortConcept,
  mergeTheFrequentPairConcept,
  mergeTwoSortedConcept,
  merkleTreeConcept,
  messagingPubsubConcept,
  mispredictionPenaltyConcept,
  mutuallyReachableConcept,
  naiveShiftByOneConcept,
  negateAndAddOneConcept,
  negativeEdgeBreaksConcept,
  neighborsLinkedAheadConcept,
  nodeHoldsManyConcept,
  nodePointsNextConcept,
  noiseLeftOutConcept,
  oneBitDoubleFaultConcept,
  oneMoreRoundDropsConcept,
  oneWayEdgeConcept,
  openAddressingProbeConcept,
  operandForwardingConcept,
  outOfBoundsConcept,
  outOfOrderExecutionConcept,
  overlappingSubproblemsConcept,
  parentTwoChildrenConcept,
  partitionAroundPivotConcept,
  pathCompressionConcept,
  pcaConcept,
  pickNearestUnsettledConcept,
  pigeonholeCollisionConcept,
  pipelineBubbleConcept,
  pivotChoiceMattersConcept,
  pNpConcept,
  positionalValueConcept,
  prefetchingConcept,
  prefixSuffixJumpConcept,
  primalityConcept,
  primMstConcept,
  probeAFewCellsConcept,
  productQuantizationConcept,
  projectAndLoseConcept,
  pruneBranchConcept,
  pushPopTopConcept,
  queueFifoConcept,
  queueVsStackOrderConcept,
  quickSortConcept,
  rabinKarpConcept,
  readyFirstConcept,
  radixSortConcept,
  randomForestConcept,
  readBeforeWriteConcept,
  recallSpeedTradeoffConcept,
  recolorThenRotateConcept,
  redBlackTreeConcept,
  reduceToKnownConcept,
  relationalTablesAndKeysConcept,
  normalFormsConcept,
  updateAnomalyConcept,
  atomicCellConcept,
  partialDependencyConcept,
  transitiveDependencyConcept,
  determinantMustBeKeyConcept,
  primaryKeyIdentifiesConcept,
  foreignKeyPointsConcept,
  rowIsAFactConcept,
  setOfRowsConcept,
  relaxShorterPathConcept,
  relinkInsertConcept,
  rerankingConcept,
  repeatRelaxAllConcept,
  requiresSortedConcept,
  residualDistanceConcept,
  rollingHashConcept,
  rotateToBalanceConcept,
  rowTimesColumnConcept,
  saturatingCounterConcept,
  scanUntilFoundConcept,
  sccConcept,
  selectionSortConcept,
  selectMinEachPassConcept,
  separateComponentsConcept,
  setAssociativeCacheConcept,
  severalHashesOneValueConcept,
  sharePrefixPathConcept,
  shellSortConcept,
  shiftOnInsertConcept,
  shiftOnRemoveConcept,
  sieveConcept,
  siftDownConcept,
  siftUpConcept,
  simdConcept,
  signatureKeyDirectionConcept,
  signatureOnHashConcept,
  signedWraparoundConcept,
  silentTruncationConcept,
  skipALayerConcept,
  skipListConcept,
  sortEdgesAvoidCycleConcept,
  sortStabilityConcept,
  spaceErrorTradeoffConcept,
  spaceIsPartOfItConcept,
  spatialLocalityConcept,
  speculativeDecodingConcept,
  paddingGapConcept,
  fieldOrderSizeConcept,
  splitAndNumberConcept,
  splitByQuestionConcept,
  splitUntilOneConcept,
  splitWhenFullConcept,
  squareAndHalveConcept,
  squashToProbabilityConcept,
  stackConcept,
  structAlignmentConcept,
  stageOverlapConcept,
  staticPredictionConcept,
  subwordSegmentationConcept,
  suffixArrayConcept,
  supportVectorsOnlyConcept,
  svmConcept,
  takeBestNowConcept,
  temperatureSamplingConcept,
  flattenOrSharpenConcept,
  penalizeRepeatsConcept,
  tDigestConcept,
  temporalLocalityConcept,
  threeEditChoicesConcept,
  throughMiddleNodeConcept,
  throughputNotLatencyConcept,
  tokenizationConcept,
  tokensPerLanguageConcept,
  kvCacheConcept,
  dontRecountThePastConcept,
  cacheKeepsGrowingConcept,
  firstTokenVsRestConcept,
  topKTopPConcept,
  cutTheTailConcept,
  fillToAShareConcept,
  contextAssemblyConcept,
  budgetRunsOutConcept,
  lostInTheMiddleConcept,
  topologicalSortConcept,
  traversalOrderConcept,
  traverseFromHeadConcept,
  trieConcept,
  trustTheSmallestConcept,
  tryAndUndoConcept,
  tsneConcept,
  twoColorConflictConcept,
  twosComplementConcept,
  undoByBackEdgeConcept,
  unevenFloatGapsConcept,
  unionByRankConcept,
  unionFindConcept,
  unknownBecomesKnownConcept,
  unrepresentableFractionConcept,
  vectorSimilarityConcept,
  verifyVsFindConcept,
  vocabularyConcept,
  voteByNeighborsConcept,
  walkPerCharacterConcept,
  widestMarginConcept,
  writeBackVsThroughConcept,
  writePolicyConcept,
  wrongInOneDirectionConcept,
  zAlgorithmConcept,
  arrayTraversalOrderConcept,
  rowVsColumnWalkConcept,
  strideAndMissConcept,
  chunkingConcept,
  whereToCutConcept,
  overlapTheSeamConcept,
  batchingAndPaddingConcept,
  shortWaitsForLongConcept,
  refillTheEmptySlotConcept,
  hybridSearchConcept,
  sameWordVsSameMeaningConcept,
  fuseTwoRankingsConcept,
  branchTakeOnePathConcept,
  multiwayBranchConcept,
  loopBackConcept,
  loopTerminationConcept,
  recursionSelfCallConcept,
  callStackUnwindConcept,
  baseCaseConcept,
  exceptionPropagateConcept,
  passByValueVsReferenceConcept,
  returnToCallerConcept,
  closureCapturesConcept,
  functionAsValueConcept,
  curryingPartialConcept,
  valueInPlaceConcept,
  referenceHoldsAddressConcept,
  aliasingConcept,
  narrowingLossConcept,
  shadowingConcept,
  scopeExitConcept,
  danglingReferenceConcept,
  stackVsHeapConcept,
  pointerDereferenceConcept,
  gcReachableFromRootConcept,
  refcountZeroConcept,
  referenceCycleConcept,
  manualFreeConcept,
  doubleFreeConcept,
  memoryLeakConcept,
  tracingVsRefcountConcept,
  allocateAndFreeConcept,
  loopVsRecursionConcept,
  copyVsShareConcept,
  pureSameOutputConcept,
  noSideEffectConcept,
  immutableCopyConcept,
  mapOneByOneConcept,
  filterKeepSomeConcept,
  reduceFoldConcept,
  monadChainInBoxConcept,
  instantiateFromClassConcept,
  methodLookupUpConcept,
  dynamicDispatchConcept,
  interfaceSlotConcept,
  encapsulationBoundaryConcept,
  polymorphismConcept,
  pureFunctionConcept,
  mapFilterReduceConcept,
  fileBlockPlacementConcept,
  inodePointsBlocksConcept,
  indirectBlockConcept,
  chainOfBlocksConcept,
  pathResolutionConcept,
  hardVsSoftLinkConcept,
  journalingConcept,
  writeIntentFirstConcept,
  replayAfterCrashConcept,
  ioTransferModesConcept,
  transferWithoutCpuConcept,
  interruptPreemptsConcept,
  pollingVsInterruptConcept,
  diskSchedulingConcept,
  seekDistanceCostsConcept,
  elevatorSweepConcept,
  schedulingPolicyConcept,
  roundRobinQuantumConcept,
  priorityAgingConcept,
  weightedFairShareConcept,
  readyQueuePickConcept,
  turnaroundVsWaitConcept,
  firstComeFirstRunConcept,
  convoyEffectConcept,
  shortestFirstConcept,
  starvationOfLongConcept,
  demoteOnOveruseConcept,
  timeSliceRotateConcept,
  quantumSizeTradeoffConcept,
  priorityPreemptConcept,
  agingConcept,
  virtualRuntimeConcept,
  pagingConcept,
  pageTableLookupConcept,
  fixedSizeFramesConcept,
  tlbCachesTranslationConcept,
  segmentationConcept,
  variableSizeSegmentsConcept,
  externalFragmentationConcept,
  virtualMemoryConcept,
  pageFaultConcept,
  swapInOutConcept,
  thrashingConcept,
  pageReplacementConcept,
  evictLeastRecentConcept,
  recencyReorderConcept,
  evictOldestConcept,
  beladyAnomalyConcept,
  secondChanceConcept,
  processStateConcept,
  stateTransitionsConcept,
  blockedWaitsEventConcept,
  pcbHoldsStateConcept,
  saveAndRestoreConcept,
  switchCostsConcept,
  mutexConcept,
  interleavingConcept,
  nonAtomicIncrementConcept,
  lostUpdateConcept,
  criticalSectionConcept,
  lockExcludesConcept,
  deadlockConcept,
  holdAndWaitConcept,
  noPreemptionConcept,
  waitCycleConcept,
  lockOrderingConcept,
  producerConsumerConcept,
  countingPermitsConcept,
  waitAndSignalConcept,
  boundedBufferConcept,
  tcpHandshakeConcept,
  threeWaySyncConcept,
  sequenceNumberConcept,
  sendAndForgetConcept,
  portDemultiplexConcept,
  controlAndDataChannelConcept,
  congestionControlConcept,
  receiverWindowConcept,
  slowStartConcept,
  backOffOnLossConcept,
  sawtoothConcept,
  ripConcept,
  natConcept,
  firewallConcept,
  hopCountMetricConcept,
  countToInfinityConcept,
  linkStateFloodConcept,
  shortestPathTreeConcept,
  pathVectorPolicyConcept,
  rewriteAddressPortConcept,
  natMappingTableConcept,
  ruleMatchOrderConcept,
  longestPrefixMatchConcept,
  forwardingTableConcept,
  echoAndReplyConcept,
  ttlExpiredReportsConcept,
  physicalLayerConcept,
  bitsAsSignalConcept,
  frameBoundaryConcept,
  networkLayerConcept,
  layerWrapsPayloadConcept,
  peerLayerTalkConcept,
  hopByHopConcept,
  storeAndForwardConcept,
  ethernetConcept,
  collisionAndBackoffConcept,
  arpConcept,
  askWhoHasConcept,
  arpCacheConcept,
  macIsLocalConcept,
  httpConcept,
  requestResponseConcept,
  statelessNeedsTokenConcept,
  upgradeThenKeepOpenConcept,
  dnsConcept,
  delegateDownTheTreeConcept,
  cacheTtlConcept,
  tlsHandshakeConcept,
  sharedSecretInPublicConcept,
  certificateChainConcept,
  authConcept,
  tokenBearerConcept,
  documentKvConcept,
  nestedDocumentConcept,
  keyToValueConcept,
  columnFamilyConcept,
  columnOrientedConcept,
  graphDbConcept,
  traverseRelationshipsConcept,
  dmlConcept,
  joinKindsConcept,
  subqueryConcept,
  windowFunctionConcept,
  insertUpdateDeleteConcept,
  schemaDefinesShapeConcept,
  matchOnKeyConcept,
  keepUnmatchedConcept,
  allPairsConcept,
  queryInsideQueryConcept,
  windowSlidesConcept,
  groupThenAggregateConcept,
  acidConcept,
  allOrNothingConcept,
  durableAfterCommitConcept,
  isolationConcept,
  dirtyReadConcept,
  nonRepeatableReadConcept,
  phantomReadConcept,
  sharedVsExclusiveConcept,
  lockWaitConcept,
  growThenShrinkConcept,
  mvccConcept,
  keepOldVersionConcept,
  readSeesSnapshotConcept,
  replicationConcept,
  copyToFollowersConcept,
  replicationLagConcept,
  partitionForcesChoiceConcept,
  shardingConcept,
  splitByKeyConcept,
  hotShardConcept,
  raftConcept,
  electALeaderConcept,
  majorityDecidesConcept,
  logReplicateInOrderConcept,
  splitBrainConcept,
  paxosConcept,
  proposeAndPromiseConcept,
  indexChoiceConcept,
  leavesLinkedConcept,
  allDataInLeavesConcept,
  indexCostsWriteConcept,
  exactMatchOnlyConcept,
  bitmapIndexConcept,
  bitPerRowConcept,
  bitwiseCombineConcept,
  compositeIndexConcept,
  leftmostPrefixConcept,
  optimizerConcept,
  sameAnswerDifferentPlanConcept,
  reorderJoinsConcept,
  planIsATreeConcept,
  costModelConcept,
  estimateFromStatsConcept,
  badEstimateBadPlanConcept,
  cascadePriorityConcept,
  selectorRightToLeftConcept,
  cascadeConflictConcept,
  layoutThrashConcept,
  forcedSyncLayoutConcept,
  oneGrowsRestShiftConcept,
  repaintCostConcept,
  stackOfSheetsConcept,
  layerPromotionConcept,
  keyedReconciliationConcept,
  sideBySideTreesConcept,
  typeChangeRebuildConcept,
  missingKeyRemountConcept,
  keyReorderConcept,
  reactiveUpdatesConcept,
  readIsSubscribeConcept,
  dirtyScanConcept,
  coalesceUpdatesConcept,
  cooperativeYieldingConcept,
  longTaskBlocksConcept,
  yieldToRenderConcept,
  microtaskStarvationConcept,
  frameBudgetConcept,
  layoutPerFrameConcept,
  moveWithoutRepaintConcept,
  sixteenMillisecondsConcept,
  droppedFrameConcept,
  criticalPathConcept,
  parserStopsConcept,
  deferVsAsyncConcept,
  styleBlocksPaintConcept,
  preloadHintConcept,
  fontSwapConcept,
  whatFirstPaintNeedsConcept,
  framesStackUpConcept,
  oneTurnAtATimeConcept,
  timerIsAFloorConcept,
  microtaskCutsInConcept,
  twoTreesMeetConcept,
  justBeforePaintConcept,
  jankVsSlowConcept,
];
