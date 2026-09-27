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
import { lfuCacheConcept } from './lfu-cache.js';
import { evictLeastFrequentConcept } from './evict-least-frequent.js';
import { cacheCoherenceConcept } from './cache-coherence.js';
import { staleCopyConcept } from './stale-copy.js';
import { invalidateOthersConcept } from './invalidate-others.js';
import { cacheHitMissConcept } from './cache-hit-miss.js';
import { serveFromNearConcept } from './serve-from-near.js';
import { originPullConcept } from './origin-pull.js';
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
import { kafkaPatternConcept } from './kafka-pattern.js';
import { appendOnlyLogConcept } from './append-only-log.js';
import { consumerOffsetConcept } from './consumer-offset.js';
import { replayFromOffsetConcept } from './replay-from-offset.js';
import { publishToManyConcept } from './publish-to-many.js';
import { decoupleSenderReceiverConcept } from './decouple-sender-receiver.js';
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
import { roundRobinLbConcept } from './round-robin-lb.js';
import { spreadInTurnConcept } from './spread-in-turn.js';
import { sendToIdlestConcept } from './send-to-idlest.js';
import { ringOfHashesConcept } from './ring-of-hashes.js';
import { moveFewOnChangeConcept } from './move-few-on-change.js';
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
import { foldAndSweepConcept } from './fold-and-sweep.js';
import { foldAtCompileConcept } from './fold-at-compile.js';
import { unusedIsRemovedConcept } from './unused-is-removed.js';
import { loopOptimizationConcept } from './loop-optimization.js';
import { hoistInvariantConcept } from './hoist-invariant.js';
import { unrollLoopConcept } from './unroll-loop.js';
import { inliningTradeoffConcept } from './inlining-tradeoff.js';
import { pasteTheBodyConcept } from './paste-the-body.js';
import { inlineGrowsCodeConcept } from './inline-grows-code.js';
import { splitIntoTokensConcept } from './split-into-tokens.js';
import { longestMatchWinsConcept } from './longest-match-wins.js';
import { regexBacktrackingConcept } from './regex-backtracking.js';
import { patternMatchesSetConcept } from './pattern-matches-set.js';
import { backtrackOnFailConcept } from './backtrack-on-fail.js';
import { finiteAutomataConcept } from './finite-automata.js';
import { stateEatsCharConcept } from './state-eats-char.js';
import { acceptStateConcept } from './accept-state.js';
import { nfaToDfaConcept } from './nfa-to-dfa.js';
import { registerAllocationConcept } from './register-allocation.js';
import { registersAreFewConcept } from './registers-are-few.js';
import { spillToMemoryConcept } from './spill-to-memory.js';
import { interferenceGraphConcept } from './interference-graph.js';
import { instructionSelectionConcept } from './instruction-selection.js';
import { patternToInstructionConcept } from './pattern-to-instruction.js';
import { linkerConcept } from './linker.js';
import { resolveSymbolsConcept } from './resolve-symbols.js';
import { relocateAddressesConcept } from './relocate-addresses.js';
import { parseTreeToAstConcept } from './parse-tree-to-ast.js';
import { ruleExpandsConcept } from './rule-expands.js';
import { derivationTreeConcept } from './derivation-tree.js';
import { treeDropsSyntaxConcept } from './tree-drops-syntax.js';
import { recursiveDescentConcept } from './recursive-descent.js';
import { oneFunctionPerRuleConcept } from './one-function-per-rule.js';
import { lookaheadOneConcept } from './lookahead-one.js';
import { lrPrecedenceConcept } from './lr-precedence.js';
import { shiftOrReduceConcept } from './shift-or-reduce.js';
import { parseConflictConcept } from './parse-conflict.js';
import { typeCheckingConcept } from './type-checking.js';
import { typeFlowsUpConcept } from './type-flows-up.js';
import { typeMismatchConcept } from './type-mismatch.js';
import { scopeAndSymbolsConcept } from './scope-and-symbols.js';
import { resolveToDeclarationConcept } from './resolve-to-declaration.js';
import { tablePerScopeConcept } from './table-per-scope.js';
import { ssaFormConcept } from './ssa-form.js';
import { assignOnceConcept } from './assign-once.js';
import { phiMergesConcept } from './phi-merges.js';
import { flowGraphsConcept } from './flow-graphs.js';
import { basicBlockConcept } from './basic-block.js';
import { edgesAreJumpsConcept } from './edges-are-jumps.js';
import { valueFlowsToUseConcept } from './value-flows-to-use.js';
import { lowerToSimplerConcept } from './lower-to-simpler.js';
import { branchCoverageConcept } from './branch-coverage.js';
import { linesYouSteppedOnConcept } from './lines-you-stepped-on.js';
import { linesCoveredBranchNotConcept } from './lines-covered-branch-not.js';
import { whichConditionDecidedConcept } from './which-condition-decided.js';
import { pathExplosionConcept } from './path-explosion.js';
import { survivingMutantConcept } from './surviving-mutant.js';
import { shrinkToSmallestConcept } from './shrink-to-smallest.js';
import { semanticVersioningConcept } from './semantic-versioning.js';
import { threeNumbersConcept } from './three-numbers.js';
import { rangeAndCandidatesConcept } from './range-and-candidates.js';
import { pinWhatWasChosenConcept } from './pin-what-was-chosen.js';
import { dependencyResolutionConcept } from './dependency-resolution.js';
import { diamondDependencyConcept } from './diamond-dependency.js';
import { noOverlapConcept } from './no-overlap.js';
import { twoCopiesCoexistConcept } from './two-copies-coexist.js';
import { dependencyGraphConcept } from './dependency-graph.js';
import { whoGoesFirstConcept } from './who-goes-first.js';
import { independentInParallelConcept } from './independent-in-parallel.js';
import { incrementalBuildConcept } from './incremental-build.js';
import { onlyWhatChangedConcept } from './only-what-changed.js';
import { timestampVsFingerprintConcept } from './timestamp-vs-fingerprint.js';
import { cacheInvalidationConcept } from './cache-invalidation.js';
import { invalidationCascadeConcept } from './invalidation-cascade.js';
import { nobodyCanBeFirstConcept } from './nobody-can-be-first.js';
import { myersDiffConcept } from './myers-diff.js';
import { keepTheCommonConcept } from './keep-the-common.js';
import { editScriptConcept } from './edit-script.js';
import { diagonalIsFreeConcept } from './diagonal-is-free.js';
import { threeWayMergeConcept } from './three-way-merge.js';
import { ancestorAsRefereeConcept } from './ancestor-as-referee.js';
import { oneSideChangedConcept } from './one-side-changed.js';
import { bothTouchedSameLineConcept } from './both-touched-same-line.js';
import { moveLooksLikeRewriteConcept } from './move-looks-like-rewrite.js';
import { rebaseVsMergeConcept } from './rebase-vs-merge.js';
import { historyBisectConcept } from './history-bisect.js';
import { snapshotPointsBackConcept } from './snapshot-points-back.js';
import { branchIsALabelConcept } from './branch-is-a-label.js';
import { unreachableSnapshotConcept } from './unreachable-snapshot.js';
import { fastForwardConcept } from './fast-forward.js';
import { whereTheyPartedConcept } from './where-they-parted.js';
import { replayOnNewBaseConcept } from './replay-on-new-base.js';
import { pickOneOutConcept } from './pick-one-out.js';
import { bisectHalvingConcept } from './bisect-halving.js';
import { unrolledRnnConcept } from './unrolled-rnn.js';
import { carryHiddenStateConcept } from './carry-hidden-state.js';
import { sameWeightsEachStepConcept } from './same-weights-each-step.js';
import { unrollThenBackpropConcept } from './unroll-then-backprop.js';
import { vanishingOverTimeConcept } from './vanishing-over-time.js';
import { gatedCellsConcept } from './gated-cells.js';
import { gateLetsThroughConcept } from './gate-lets-through.js';
import { cellCarriesLongConcept } from './cell-carries-long.js';
import { fewerGatesConcept } from './fewer-gates.js';
import { mdpConcept } from './mdp.js';
import { stateActionRewardConcept } from './state-action-reward.js';
import { discountFutureConcept } from './discount-future.js';
import { qLearningConcept } from './q-learning.js';
import { valueOfActionConcept } from './value-of-action.js';
import { exploreVsExploitConcept } from './explore-vs-exploit.js';
import { policyGradientConcept } from './policy-gradient.js';
import { nudgeTowardRewardConcept } from './nudge-toward-reward.js';
import { vaeConcept } from './vae.js';
import { encodeToDistributionConcept } from './encode-to-distribution.js';
import { sampleAndDecodeConcept } from './sample-and-decode.js';
import { ganConcept } from './gan.js';
import { twoNetsCompeteConcept } from './two-nets-compete.js';
import { modeCollapseConcept } from './mode-collapse.js';
import { diffusionConcept } from './diffusion.js';
import { addNoiseThenRemoveConcept } from './add-noise-then-remove.js';
import { denoiseStepByStepConcept } from './denoise-step-by-step.js';
import { selfAttentionConcept } from './self-attention.js';
import { queryKeyValueConcept } from './query-key-value.js';
import { attendToAllAtOnceConcept } from './attend-to-all-at-once.js';
import { attentionWeightsConcept } from './attention-weights.js';
import { severalViewsConcept } from './several-views.js';
import { positionalEncodingConcept } from './positional-encoding.js';
import { orderMustBeAddedConcept } from './order-must-be-added.js';
import { convolutionConcept } from './convolution.js';
import { slideTheKernelConcept } from './slide-the-kernel.js';
import { weightSharingConcept } from './weight-sharing.js';
import { strideAndPaddingConcept } from './stride-and-padding.js';
import { receptiveFieldConcept } from './receptive-field.js';
import { fieldGrowsWithDepthConcept } from './field-grows-with-depth.js';
import { shrinkBySummaryConcept } from './shrink-by-summary.js';
import { learnedFilterConcept } from './learned-filter.js';
import { filtersLearnEdgesConcept } from './filters-learn-edges.js';
import { crossValidationConcept } from './cross-validation.js';
import { holdOutSomeConcept } from './hold-out-some.js';
import { rotateTheFoldConcept } from './rotate-the-fold.js';
import { rocImbalanceConcept } from './roc-imbalance.js';
import { thresholdSlidesConcept } from './threshold-slides.js';
import { fourBoxesConcept } from './four-boxes.js';
import { weightPenaltyConcept } from './weight-penalty.js';
import { pushToZeroConcept } from './push-to-zero.js';
import { shrinkAllConcept } from './shrink-all.js';
import { earlyStoppingConcept } from './early-stopping.js';
import { stopBeforeTurnConcept } from './stop-before-turn.js';
import { overfittingConcept } from './overfitting.js';
import { memorizeVsGeneralizeConcept } from './memorize-vs-generalize.js';
import { trainDownValUpConcept } from './train-down-val-up.js';
import { perceptronConcept } from './perceptron.js';
import { weightedSumThresholdConcept } from './weighted-sum-threshold.js';
import { mlpActivationConcept } from './mlp-activation.js';
import { layersComposeConcept } from './layers-compose.js';
import { hiddenLayerFeaturesConcept } from './hidden-layer-features.js';
import { nonlinearBendsConcept } from './nonlinear-bends.js';
import { saturateAndVanishConcept } from './saturate-and-vanish.js';
import { lossConcept } from './loss.js';
import { lossMeasuresWrongnessConcept } from './loss-measures-wrongness.js';
import { backpropConcept } from './backprop.js';
import { errorFlowsBackwardConcept } from './error-flows-backward.js';
import { gradientThroughLayersConcept } from './gradient-through-layers.js';
import { dropoutConcept } from './dropout.js';
import { dropRandomUnitsConcept } from './drop-random-units.js';
import { gradientDescentConcept } from './gradient-descent.js';
import { learningRateTooBigConcept } from './learning-rate-too-big.js';
import { localMinimumConcept } from './local-minimum.js';
import { sgdConcept } from './sgd.js';
import { oneBatchAtATimeConcept } from './one-batch-at-a-time.js';
import { noisyPathConcept } from './noisy-path.js';
import { momentumConcept } from './momentum.js';
import { carryVelocityConcept } from './carry-velocity.js';
import { adamConcept } from './adam.js';
import { perParameterStepConcept } from './per-parameter-step.js';
import { batchnormConcept } from './batchnorm.js';
import { rescaleEachBatchConcept } from './rescale-each-batch.js';
import { serviceDiscoveryConcept } from './service-discovery.js';
import { registerAndFindConcept } from './register-and-find.js';
import { oneDoorManyRoomsConcept } from './one-door-many-rooms.js';
import { circuitBreakerConcept } from './circuit-breaker.js';
import { tripAfterFailuresConcept } from './trip-after-failures.js';
import { halfOpenProbeConcept } from './half-open-probe.js';
import { consistencyModelConcept } from './consistency-model.js';
import { readYourWriteConcept } from './read-your-write.js';
import { eventuallyAgreesConcept } from './eventually-agrees.js';
import { agreeOnOneValueConcept } from './agree-on-one-value.js';
import { clockSyncConcept } from './clock-sync.js';
import { clocksDriftConcept } from './clocks-drift.js';
import { happensBeforeConcept } from './happens-before.js';
import { backpressureConcept } from './backpressure.js';
import { tellThemToSlowDownConcept } from './tell-them-to-slow-down.js';
import { shedToSurviveConcept } from './shed-to-survive.js';
import { retryAndBackoffConcept } from './retry-and-backoff.js';
import { retryStormConcept } from './retry-storm.js';
import { jitteredBackoffConcept } from './jittered-backoff.js';
import { bulkheadConcept } from './bulkhead.js';
import { isolateTheFloodConcept } from './isolate-the-flood.js';
import { queueingModelConcept } from './queueing-model.js';
import { arrivalVsServiceConcept } from './arrival-vs-service.js';
import { lengthIsRateTimesWaitConcept } from './length-is-rate-times-wait.js';
import { kneeOfTheCurveConcept } from './knee-of-the-curve.js';
import { rateLimitingConcept } from './rate-limiting.js';
import { tokenBucketConcept } from './token-bucket.js';
import { leakyBucketConcept } from './leaky-bucket.js';
import { slidingWindowCountConcept } from './sliding-window-count.js';
import { certificateConcept } from './certificate.js';
import { bindsKeyToNameConcept } from './binds-key-to-name.js';
import { trustAnchorConcept } from './trust-anchor.js';
import { eccConcept } from './ecc.js';
import { mixAndCannotUnmixConcept } from './mix-and-cannot-unmix.js';
import { pointAddOnCurveConcept } from './point-add-on-curve.js';
import { smallerKeySameStrengthConcept } from './smaller-key-same-strength.js';
import { easyOneWayHardBackConcept } from './easy-one-way-hard-back.js';
import { trapdoorWithKeyConcept } from './trapdoor-with-key.js';
import { shaConcept } from './sha.js';
import { compressBlockByBlockConcept } from './compress-block-by-block.js';
import { internalStateCarriesConcept } from './internal-state-carries.js';
import { keyPlusMessageConcept } from './key-plus-message.js';
import { hashTwiceWithPadsConcept } from './hash-twice-with-pads.js';
import { collisionConcept } from './collision.js';
import { birthdayParadoxConcept } from './birthday-paradox.js';
import { blockCipherConcept } from './block-cipher.js';
import { substituteAndPermuteConcept } from './substitute-and-permute.js';
import { roundKeyMixConcept } from './round-key-mix.js';
import { fixedSizeBlockConcept } from './fixed-size-block.js';
import { modeChainsBlocksConcept } from './mode-chains-blocks.js';
import { ivMakesDifferentConcept } from './iv-makes-different.js';
import { xorWithKeystreamConcept } from './xor-with-keystream.js';
import { neverReuseKeystreamConcept } from './never-reuse-keystream.js';
import { rasterizationConcept } from './rasterization.js';
import { triangleToPixelsConcept } from './triangle-to-pixels.js';
import { depthTestConcept } from './depth-test.js';
import { interpolateAcrossConcept } from './interpolate-across.js';
import { globalIlluminationConcept } from './global-illumination.js';
import { lightBouncesManyConcept } from './light-bounces-many.js';
import { colorBleedingConcept } from './color-bleeding.js';
import { projectionConcept } from './projection.js';
import { worldToCameraConcept } from './world-to-camera.js';
import { lookAtDirectionConcept } from './look-at-direction.js';
import { perspectiveShrinksFarConcept } from './perspective-shrinks-far.js';
import { orthographicKeepsSizeConcept } from './orthographic-keeps-size.js';
import { cutOutsideFrustumConcept } from './cut-outside-frustum.js';
import { rayTracingBaseConcept } from './ray-tracing-base.js';
import { shootRayPerPixelConcept } from './shoot-ray-per-pixel.js';
import { nearestHitConcept } from './nearest-hit.js';
import { reflectAndRefractConcept } from './reflect-and-refract.js';
import { shadowRayConcept } from './shadow-ray.js';
import { scaleRotateTranslateConcept } from './scale-rotate-translate.js';
import { scaleStretchesConcept } from './scale-stretches.js';
import { rotateTurnsConcept } from './rotate-turns.js';
import { translateSlidesConcept } from './translate-slides.js';
import { extraDimensionForTranslateConcept } from './extra-dimension-for-translate.js';
import { wDivideConcept } from './w-divide.js';
import { brdfConcept } from './brdf.js';
import { ambientDiffuseSpecularConcept } from './ambient-diffuse-specular.js';
import { normalDecidesBrightnessConcept } from './normal-decides-brightness.js';
import { energyConservingConcept } from './energy-conserving.js';
import { roughnessMetallicConcept } from './roughness-metallic.js';
import { reflectDistributionConcept } from './reflect-distribution.js';
import { vectorAsArrowConcept } from './vector-as-arrow.js';
import { vectorAddTipToTailConcept } from './vector-add-tip-to-tail.js';
import { vectorScaleConcept } from './vector-scale.js';
import { vectorNormalizeConcept } from './vector-normalize.js';
import { dotProductShadowConcept } from './dot-product-shadow.js';
import { crossProductPerpendicularConcept } from './cross-product-perpendicular.js';
import { handshakeLemmaConcept } from './handshake-lemma.js';
import { bipartiteColoringConcept } from './bipartite-coloring.js';
import { matrixOpsConcept } from './matrix-ops.js';
import { matrixAsTransformConcept } from './matrix-as-transform.js';
import { matrixColumnsAreBasisConcept } from './matrix-columns-are-basis.js';
import { matvecAsCombinationConcept } from './matvec-as-combination.js';
import { matrixProductChainConcept } from './matrix-product-chain.js';
import { determinantAreaConcept } from './determinant-area.js';
import { determinantZeroCollapseConcept } from './determinant-zero-collapse.js';
import { inverseUndoesConcept } from './inverse-undoes.js';
import { eigenConcept } from './eigen.js';
import { eigenvectorDirectionConcept } from './eigenvector-direction.js';
import { powerIterationDriftConcept } from './power-iteration-drift.js';
import { svdConcept } from './svd.js';
import { svdThreeStepsConcept } from './svd-three-steps.js';
import { lowRankApproxConcept } from './low-rank-approx.js';
import { integralConcept } from './integral.js';
import { secantToTangentConcept } from './secant-to-tangent.js';
import { chainRuleMultiplyConcept } from './chain-rule-multiply.js';
import { riemannSumConcept } from './riemann-sum.js';
import { fundamentalTheoremConcept } from './fundamental-theorem.js';
import { gradientConcept } from './gradient.js';
import { partialSliceConcept } from './partial-slice.js';
import { gradientSteepestConcept } from './gradient-steepest.js';
import { gradientStepConcept } from './gradient-step.js';
import { cltConcept } from './clt.js';
import { histogramShapeConcept } from './histogram-shape.js';
import { meanAndSpreadConcept } from './mean-and-spread.js';
import { cltBellConcept } from './clt-bell.js';
import { lawOfLargeNumbersConcept } from './law-of-large-numbers.js';
import { bayesConcept } from './bayes.js';
import { conditionalNarrowingConcept } from './conditional-narrowing.js';
import { bayesUpdateConcept } from './bayes-update.js';
import { baseRateConcept } from './base-rate.js';

import { combinatoricsConcept } from './combinatorics.js';
import { setOperationsConcept } from './set-operations.js';
import { inclusionExclusionConcept } from './inclusion-exclusion.js';
import { powerSetConcept } from './power-set.js';
import { productRuleTreeConcept } from './product-rule-tree.js';
import { permutationVsCombinationConcept } from './permutation-vs-combination.js';
import { pascalTriangleConcept } from './pascal-triangle.js';
import { numberTheoryConcept } from './number-theory.js';
import { modularClockConcept } from './modular-clock.js';
import { euclidGcdConcept } from './euclid-gcd.js';
import { sieveOfEratosthenesConcept } from './sieve-of-eratosthenes.js';
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
  lfuCacheConcept,
  evictLeastFrequentConcept,
  cacheCoherenceConcept,
  staleCopyConcept,
  invalidateOthersConcept,
  cacheHitMissConcept,
  serveFromNearConcept,
  originPullConcept,
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
  kafkaPatternConcept,
  appendOnlyLogConcept,
  consumerOffsetConcept,
  replayFromOffsetConcept,
  publishToManyConcept,
  decoupleSenderReceiverConcept,
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
  roundRobinLbConcept,
  spreadInTurnConcept,
  sendToIdlestConcept,
  ringOfHashesConcept,
  moveFewOnChangeConcept,
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
  foldAndSweepConcept,
  foldAtCompileConcept,
  unusedIsRemovedConcept,
  loopOptimizationConcept,
  hoistInvariantConcept,
  unrollLoopConcept,
  inliningTradeoffConcept,
  pasteTheBodyConcept,
  inlineGrowsCodeConcept,
  splitIntoTokensConcept,
  longestMatchWinsConcept,
  regexBacktrackingConcept,
  patternMatchesSetConcept,
  backtrackOnFailConcept,
  finiteAutomataConcept,
  stateEatsCharConcept,
  acceptStateConcept,
  nfaToDfaConcept,
  registerAllocationConcept,
  registersAreFewConcept,
  spillToMemoryConcept,
  interferenceGraphConcept,
  instructionSelectionConcept,
  patternToInstructionConcept,
  linkerConcept,
  resolveSymbolsConcept,
  relocateAddressesConcept,
  parseTreeToAstConcept,
  ruleExpandsConcept,
  derivationTreeConcept,
  treeDropsSyntaxConcept,
  recursiveDescentConcept,
  oneFunctionPerRuleConcept,
  lookaheadOneConcept,
  lrPrecedenceConcept,
  shiftOrReduceConcept,
  parseConflictConcept,
  typeCheckingConcept,
  typeFlowsUpConcept,
  typeMismatchConcept,
  scopeAndSymbolsConcept,
  resolveToDeclarationConcept,
  tablePerScopeConcept,
  ssaFormConcept,
  assignOnceConcept,
  phiMergesConcept,
  flowGraphsConcept,
  basicBlockConcept,
  edgesAreJumpsConcept,
  valueFlowsToUseConcept,
  lowerToSimplerConcept,
  branchCoverageConcept,
  linesYouSteppedOnConcept,
  linesCoveredBranchNotConcept,
  whichConditionDecidedConcept,
  pathExplosionConcept,
  survivingMutantConcept,
  shrinkToSmallestConcept,
  semanticVersioningConcept,
  threeNumbersConcept,
  rangeAndCandidatesConcept,
  pinWhatWasChosenConcept,
  dependencyResolutionConcept,
  diamondDependencyConcept,
  noOverlapConcept,
  twoCopiesCoexistConcept,
  dependencyGraphConcept,
  whoGoesFirstConcept,
  independentInParallelConcept,
  incrementalBuildConcept,
  onlyWhatChangedConcept,
  timestampVsFingerprintConcept,
  cacheInvalidationConcept,
  invalidationCascadeConcept,
  nobodyCanBeFirstConcept,
  myersDiffConcept,
  keepTheCommonConcept,
  editScriptConcept,
  diagonalIsFreeConcept,
  threeWayMergeConcept,
  ancestorAsRefereeConcept,
  oneSideChangedConcept,
  bothTouchedSameLineConcept,
  moveLooksLikeRewriteConcept,
  rebaseVsMergeConcept,
  historyBisectConcept,
  snapshotPointsBackConcept,
  branchIsALabelConcept,
  unreachableSnapshotConcept,
  fastForwardConcept,
  whereTheyPartedConcept,
  replayOnNewBaseConcept,
  pickOneOutConcept,
  bisectHalvingConcept,
  unrolledRnnConcept,
  carryHiddenStateConcept,
  sameWeightsEachStepConcept,
  unrollThenBackpropConcept,
  vanishingOverTimeConcept,
  gatedCellsConcept,
  gateLetsThroughConcept,
  cellCarriesLongConcept,
  fewerGatesConcept,
  mdpConcept,
  stateActionRewardConcept,
  discountFutureConcept,
  qLearningConcept,
  valueOfActionConcept,
  exploreVsExploitConcept,
  policyGradientConcept,
  nudgeTowardRewardConcept,
  vaeConcept,
  encodeToDistributionConcept,
  sampleAndDecodeConcept,
  ganConcept,
  twoNetsCompeteConcept,
  modeCollapseConcept,
  diffusionConcept,
  addNoiseThenRemoveConcept,
  denoiseStepByStepConcept,
  convolutionConcept,
  slideTheKernelConcept,
  weightSharingConcept,
  strideAndPaddingConcept,
  receptiveFieldConcept,
  fieldGrowsWithDepthConcept,
  shrinkBySummaryConcept,
  learnedFilterConcept,
  filtersLearnEdgesConcept,
  selfAttentionConcept,
  queryKeyValueConcept,
  attendToAllAtOnceConcept,
  attentionWeightsConcept,
  severalViewsConcept,
  positionalEncodingConcept,
  orderMustBeAddedConcept,
  crossValidationConcept,
  holdOutSomeConcept,
  rotateTheFoldConcept,
  rocImbalanceConcept,
  thresholdSlidesConcept,
  fourBoxesConcept,
  weightPenaltyConcept,
  pushToZeroConcept,
  shrinkAllConcept,
  earlyStoppingConcept,
  stopBeforeTurnConcept,
  overfittingConcept,
  memorizeVsGeneralizeConcept,
  trainDownValUpConcept,
  perceptronConcept,
  weightedSumThresholdConcept,
  mlpActivationConcept,
  layersComposeConcept,
  hiddenLayerFeaturesConcept,
  nonlinearBendsConcept,
  saturateAndVanishConcept,
  lossConcept,
  lossMeasuresWrongnessConcept,
  backpropConcept,
  errorFlowsBackwardConcept,
  gradientThroughLayersConcept,
  dropoutConcept,
  dropRandomUnitsConcept,
  gradientDescentConcept,
  learningRateTooBigConcept,
  localMinimumConcept,
  sgdConcept,
  oneBatchAtATimeConcept,
  noisyPathConcept,
  momentumConcept,
  carryVelocityConcept,
  adamConcept,
  perParameterStepConcept,
  batchnormConcept,
  rescaleEachBatchConcept,
  serviceDiscoveryConcept,
  registerAndFindConcept,
  oneDoorManyRoomsConcept,
  circuitBreakerConcept,
  tripAfterFailuresConcept,
  halfOpenProbeConcept,
  consistencyModelConcept,
  readYourWriteConcept,
  eventuallyAgreesConcept,
  agreeOnOneValueConcept,
  clockSyncConcept,
  clocksDriftConcept,
  happensBeforeConcept,
  backpressureConcept,
  tellThemToSlowDownConcept,
  shedToSurviveConcept,
  retryAndBackoffConcept,
  retryStormConcept,
  jitteredBackoffConcept,
  bulkheadConcept,
  isolateTheFloodConcept,
  queueingModelConcept,
  arrivalVsServiceConcept,
  lengthIsRateTimesWaitConcept,
  kneeOfTheCurveConcept,
  rateLimitingConcept,
  tokenBucketConcept,
  leakyBucketConcept,
  slidingWindowCountConcept,
  certificateConcept,
  bindsKeyToNameConcept,
  trustAnchorConcept,
  eccConcept,
  mixAndCannotUnmixConcept,
  pointAddOnCurveConcept,
  smallerKeySameStrengthConcept,
  easyOneWayHardBackConcept,
  trapdoorWithKeyConcept,
  shaConcept,
  compressBlockByBlockConcept,
  internalStateCarriesConcept,
  keyPlusMessageConcept,
  hashTwiceWithPadsConcept,
  collisionConcept,
  birthdayParadoxConcept,
  blockCipherConcept,
  substituteAndPermuteConcept,
  roundKeyMixConcept,
  fixedSizeBlockConcept,
  modeChainsBlocksConcept,
  ivMakesDifferentConcept,
  xorWithKeystreamConcept,
  neverReuseKeystreamConcept,
  rasterizationConcept,
  triangleToPixelsConcept,
  depthTestConcept,
  interpolateAcrossConcept,
  globalIlluminationConcept,
  lightBouncesManyConcept,
  colorBleedingConcept,
  projectionConcept,
  worldToCameraConcept,
  lookAtDirectionConcept,
  perspectiveShrinksFarConcept,
  orthographicKeepsSizeConcept,
  cutOutsideFrustumConcept,
  rayTracingBaseConcept,
  shootRayPerPixelConcept,
  nearestHitConcept,
  reflectAndRefractConcept,
  shadowRayConcept,
  scaleRotateTranslateConcept,
  scaleStretchesConcept,
  rotateTurnsConcept,
  translateSlidesConcept,
  extraDimensionForTranslateConcept,
  wDivideConcept,
  brdfConcept,
  ambientDiffuseSpecularConcept,
  normalDecidesBrightnessConcept,
  energyConservingConcept,
  roughnessMetallicConcept,
  reflectDistributionConcept,
  vectorAsArrowConcept,
  vectorAddTipToTailConcept,
  vectorScaleConcept,
  vectorNormalizeConcept,
  dotProductShadowConcept,
  crossProductPerpendicularConcept,
  handshakeLemmaConcept,
  bipartiteColoringConcept,
  matrixOpsConcept,
  matrixAsTransformConcept,
  matrixColumnsAreBasisConcept,
  matvecAsCombinationConcept,
  matrixProductChainConcept,
  determinantAreaConcept,
  determinantZeroCollapseConcept,
  inverseUndoesConcept,
  eigenConcept,
  eigenvectorDirectionConcept,
  powerIterationDriftConcept,
  svdConcept,
  svdThreeStepsConcept,
  lowRankApproxConcept,
  integralConcept,
  secantToTangentConcept,
  chainRuleMultiplyConcept,
  riemannSumConcept,
  fundamentalTheoremConcept,
  gradientConcept,
  partialSliceConcept,
  gradientSteepestConcept,
  gradientStepConcept,
  cltConcept,
  histogramShapeConcept,
  meanAndSpreadConcept,
  cltBellConcept,
  lawOfLargeNumbersConcept,
  bayesConcept,
  conditionalNarrowingConcept,
  bayesUpdateConcept,
  baseRateConcept,
  combinatoricsConcept,
  setOperationsConcept,
  inclusionExclusionConcept,
  powerSetConcept,
  productRuleTreeConcept,
  permutationVsCombinationConcept,
  pascalTriangleConcept,
  numberTheoryConcept,
  modularClockConcept,
  euclidGcdConcept,
  sieveOfEratosthenesConcept,
];
