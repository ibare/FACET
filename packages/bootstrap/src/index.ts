/**
 * @ffacet/bootstrap — facet 카탈로그 단일 출처.
 *
 * 정적 등록 (즉시 필요):
 *  - View Catalog (built-in + code-view)
 *  - Transpiler 6종
 *
 * 동적 등록 (lazy):
 *  - algorithm 패키지(@ffacet/algorithm-*) 는 registerFacetLoader 로만 매핑.
 *    각 import() 가 번들러의 dynamic import 경계로 인식되어 facet 별 chunk 로 분리된다.
 *  - 현재 등록 facet 19종: bubbleSort (모범 사례) + 자료구조 array / stack / queue / linkedList / hashTable / bst /
 *    lruCache + 그래프 bfs + 시스템 행동 messagingPubsub + 시스템 캐싱 cachingCdn + 데이터베이스
 *    relationalTablesAndKeys + 제어 흐름 conditionalStatement + 컴파일러 어휘 분석 tokenization +
 *    비대칭 암호 asymmetricRsa + 머신러닝 기초 linearRegression + 운영체제 contextSwitching +
 *    그래픽 matrixTransform2d + 네트워크 ipRouting. 그 외 cs-fundamentals/algorithms 토픽들은 카탈로그에 슬롯만 남고 facetId 미지정.
 *
 * 소비자:
 *  - apps/playground (dev/build) — main.tsx 에서 bootstrapFacet() 호출
 *  - @ffacet/host-tiptap-bundle (외부 호스트 workspace 의존) — re-export
 *
 * 카탈로그 접근:
 *  - getFacetCatalog(locale) — facet 모듈을 로드하지 않고 추가 가능 목록(제목 · 설명 · 분야)
 *    을 한 언어로 불러온다. 빌드타임 codegen 산출(catalog/<locale>.generated.ts)을 언어별
 *    chunk 로 노출.
 */

import {
  registerBuiltinViews,
  registerFacetLoader,
} from '@ffacet/core/runtime';
import { registerCodeView } from '@ffacet/view-code';
import { registerPythonTranspiler } from '@ffacet/transpiler-python';
import { registerJavascriptTranspiler } from '@ffacet/transpiler-javascript';
import { registerTypescriptTranspiler } from '@ffacet/transpiler-typescript';
import { registerJavaTranspiler } from '@ffacet/transpiler-java';
import { registerCppTranspiler } from '@ffacet/transpiler-cpp';
import { registerCsharpTranspiler } from '@ffacet/transpiler-csharp';

export { getFacetCatalog } from './catalog.js';
export { loadFrameworkMessages } from './messages.js';
export type {
  FacetCatalog,
  FacetCatalogDomain,
  FacetCatalogEntry,
  FacetCatalogSubdomain,
} from './catalog-types.js';

let initialized = false;

export function bootstrapFacet(): void {
  if (initialized) return;
  initialized = true;

  registerBuiltinViews();
  registerCodeView();

  registerPythonTranspiler();
  registerJavascriptTranspiler();
  registerTypescriptTranspiler();
  registerJavaTranspiler();
  registerCppTranspiler();
  registerCsharpTranspiler();

  registerFacetLoader('facet:bubbleSort', () =>
    import('@ffacet/algorithm-bubble-sort').then((m) => m.registerBubblesort()),
  );
  registerFacetLoader('facet:bfs', () =>
    import('@ffacet/algorithm-bfs').then((m) => m.registerBfs()),
  );
  registerFacetLoader('facet:queueFifo', () =>
    import('@ffacet/algorithm-queue-fifo').then((m) => m.registerQueue()),
  );
  registerFacetLoader('facet:stack', () =>
    import('@ffacet/algorithm-stack').then((m) => m.registerStack()),
  );
  registerFacetLoader('facet:array', () =>
    import('@ffacet/algorithm-array').then((m) => m.registerArray()),
  );
  registerFacetLoader('facet:linkedListSingly', () =>
    import('@ffacet/algorithm-linked-list-singly').then((m) => m.registerLinkedList()),
  );
  registerFacetLoader('facet:hashTableChaining', () =>
    import('@ffacet/algorithm-hash-table-chaining').then((m) => m.registerHashTable()),
  );
  registerFacetLoader('facet:bst', () =>
    import('@ffacet/algorithm-bst').then((m) => m.registerBst()),
  );
  registerFacetLoader('facet:lruCache', () =>
    import('@ffacet/algorithm-lru-cache').then((m) => m.registerLruCache()),
  );
  registerFacetLoader('facet:messagingPubsub', () =>
    import('@ffacet/algorithm-messaging-pubsub').then((m) => m.registerMessagingPubsub()),
  );
  registerFacetLoader('facet:cachingCdn', () =>
    import('@ffacet/algorithm-caching-cdn').then((m) => m.registerCachingCdn()),
  );
  registerFacetLoader('facet:relationalTablesAndKeys', () =>
    import('@ffacet/algorithm-relational-tables-and-keys').then((m) =>
      m.registerRelationalTablesAndKeys(),
    ),
  );
  registerFacetLoader('facet:conditionalStatement', () =>
    import('@ffacet/algorithm-conditional-statement').then((m) =>
      m.registerConditionalStatement(),
    ),
  );
  registerFacetLoader('facet:tokenization', () =>
    import('@ffacet/algorithm-tokenization').then((m) => m.registerTokenization()),
  );
  registerFacetLoader('facet:asymmetricRsa', () =>
    import('@ffacet/algorithm-asymmetric-rsa').then((m) => m.registerAsymmetricRsa()),
  );
  registerFacetLoader('facet:hashAvalanche', () =>
    import('@ffacet/algorithm-hash-avalanche').then((m) => m.registerHashAvalanche()),
  );
  registerFacetLoader('facet:hashFixedLength', () =>
    import('@ffacet/algorithm-hash-fixed-length').then((m) => m.registerHashFixedLength()),
  );
  registerFacetLoader('facet:pigeonholeCollision', () =>
    import('@ffacet/algorithm-pigeonhole-collision').then((m) =>
      m.registerPigeonholeCollision(),
    ),
  );
  registerFacetLoader('facet:hashIntegrityCheck', () =>
    import('@ffacet/algorithm-hash-integrity-check').then((m) =>
      m.registerHashIntegrityCheck(),
    ),
  );
  registerFacetLoader('facet:hashSalt', () =>
    import('@ffacet/algorithm-hash-salt').then((m) => m.registerHashSalt()),
  );
  registerFacetLoader('facet:hashChain', () =>
    import('@ffacet/algorithm-hash-chain').then((m) => m.registerHashChain()),
  );
  registerFacetLoader('facet:merkleTree', () =>
    import('@ffacet/algorithm-merkle-tree').then((m) => m.registerMerkleTree()),
  );
  // 자료구조 출처의 조각 열 (큐 3 · 해시 4 · 트리 3)
  registerFacetLoader('facet:enqueueDequeueEnds', () =>
    import('@ffacet/algorithm-enqueue-dequeue-ends').then((m) => m.registerEnqueueDequeueEnds()),
  );
  registerFacetLoader('facet:circularBufferWrap', () =>
    import('@ffacet/algorithm-circular-buffer-wrap').then((m) => m.registerCircularBufferWrap()),
  );
  registerFacetLoader('facet:dequeBothEnds', () =>
    import('@ffacet/algorithm-deque-both-ends').then((m) => m.registerDequeBothEnds()),
  );
  registerFacetLoader('facet:hashToBucket', () =>
    import('@ffacet/algorithm-hash-to-bucket').then((m) => m.registerHashToBucket()),
  );
  registerFacetLoader('facet:chainingBucket', () =>
    import('@ffacet/algorithm-chaining-bucket').then((m) => m.registerChainingBucket()),
  );
  registerFacetLoader('facet:openAddressingProbe', () =>
    import('@ffacet/algorithm-open-addressing-probe').then((m) => m.registerOpenAddressingProbe()),
  );
  registerFacetLoader('facet:loadFactorRehash', () =>
    import('@ffacet/algorithm-load-factor-rehash').then((m) => m.registerLoadFactorRehash()),
  );
  registerFacetLoader('facet:parentTwoChildren', () =>
    import('@ffacet/algorithm-parent-two-children').then((m) => m.registerParentTwoChildren()),
  );
  registerFacetLoader('facet:traversalOrder', () =>
    import('@ffacet/algorithm-traversal-order').then((m) => m.registerTraversalOrder()),
  );
  registerFacetLoader('facet:depthDoublesCount', () =>
    import('@ffacet/algorithm-depth-doubles-count').then((m) => m.registerDepthDoublesCount()),
  );
  registerFacetLoader('facet:bstCompareAndGo', () =>
    import('@ffacet/algorithm-bst-compare-and-go').then((m) => m.registerBstCompareAndGo()),
  );
  registerFacetLoader('facet:bstInorderSorted', () =>
    import('@ffacet/algorithm-bst-inorder-sorted').then((m) => m.registerBstInorderSorted()),
  );
  registerFacetLoader('facet:bstDegenerate', () =>
    import('@ffacet/algorithm-bst-degenerate').then((m) => m.registerBstDegenerate()),
  );
  registerFacetLoader('facet:heightBalanceCheck', () =>
    import('@ffacet/algorithm-height-balance-check').then((m) => m.registerHeightBalanceCheck()),
  );
  registerFacetLoader('facet:rotateToBalance', () =>
    import('@ffacet/algorithm-rotate-to-balance').then((m) => m.registerRotateToBalance()),
  );
  registerFacetLoader('facet:recolorThenRotate', () =>
    import('@ffacet/algorithm-recolor-then-rotate').then((m) => m.registerRecolorThenRotate()),
  );
  registerFacetLoader('facet:blackHeightEqual', () =>
    import('@ffacet/algorithm-black-height-equal').then((m) => m.registerBlackHeightEqual()),
  );
  registerFacetLoader('facet:nodeHoldsMany', () =>
    import('@ffacet/algorithm-node-holds-many').then((m) => m.registerNodeHoldsMany()),
  );
  registerFacetLoader('facet:splitWhenFull', () =>
    import('@ffacet/algorithm-split-when-full').then((m) => m.registerSplitWhenFull()),
  );
  registerFacetLoader('facet:heightStaysLow', () =>
    import('@ffacet/algorithm-height-stays-low').then((m) => m.registerHeightStaysLow()),
  );
  registerFacetLoader('facet:sharePrefixPath', () =>
    import('@ffacet/algorithm-share-prefix-path').then((m) => m.registerSharePrefixPath()),
  );
  registerFacetLoader('facet:walkPerCharacter', () =>
    import('@ffacet/algorithm-walk-per-character').then((m) => m.registerWalkPerCharacter()),
  );
  registerFacetLoader('facet:heapProperty', () =>
    import('@ffacet/algorithm-heap-property').then((m) => m.registerHeapProperty()),
  );
  registerFacetLoader('facet:siftUp', () =>
    import('@ffacet/algorithm-sift-up').then((m) => m.registerSiftUp()),
  );
  registerFacetLoader('facet:siftDown', () =>
    import('@ffacet/algorithm-sift-down').then((m) => m.registerSiftDown()),
  );
  registerFacetLoader('facet:arrayAsTree', () =>
    import('@ffacet/algorithm-array-as-tree').then((m) => m.registerArrayAsTree()),
  );
  registerFacetLoader('facet:adjacencyListVsMatrix', () =>
    import('@ffacet/algorithm-adjacency-list-vs-matrix').then((m) => m.registerAdjacencyListVsMatrix()),
  );
  registerFacetLoader('facet:findRoot', () =>
    import('@ffacet/algorithm-find-root').then((m) => m.registerFindRoot()),
  );
  registerFacetLoader('facet:unionByRank', () =>
    import('@ffacet/algorithm-union-by-rank').then((m) => m.registerUnionByRank()),
  );
  registerFacetLoader('facet:pathCompression', () =>
    import('@ffacet/algorithm-path-compression').then((m) => m.registerPathCompression()),
  );
  registerFacetLoader('facet:heapBinary', () =>
    import('@ffacet/algorithm-heap-binary').then((m) => m.registerHeapBinary()),
  );
  registerFacetLoader('facet:unionFind', () =>
    import('@ffacet/algorithm-union-find').then((m) => m.registerUnionFind()),
  );
  registerFacetLoader('facet:trie', () =>
    import('@ffacet/algorithm-trie').then((m) => m.registerTrie()),
  );
  registerFacetLoader('facet:bTree', () =>
    import('@ffacet/algorithm-b-tree').then((m) => m.registerBTree()),
  );
  registerFacetLoader('facet:avlTree', () =>
    import('@ffacet/algorithm-avl-tree').then((m) => m.registerAvlTree()),
  );
  registerFacetLoader('facet:redBlackTree', () =>
    import('@ffacet/algorithm-red-black-tree').then((m) => m.registerRedBlackTree()),
  );

  // 자료구조 출처의 조각 열 (배열 5 · 연결 리스트 4 · 스택 1)
  registerFacetLoader('facet:indexAddressCalc', () =>
    import('@ffacet/algorithm-index-address-calc').then((m) => m.registerIndexAddressCalc()),
  );
  registerFacetLoader('facet:shiftOnInsert', () =>
    import('@ffacet/algorithm-shift-on-insert').then((m) => m.registerShiftOnInsert()),
  );
  registerFacetLoader('facet:shiftOnRemove', () =>
    import('@ffacet/algorithm-shift-on-remove').then((m) => m.registerShiftOnRemove()),
  );
  registerFacetLoader('facet:growAndCopy', () =>
    import('@ffacet/algorithm-grow-and-copy').then((m) => m.registerGrowAndCopy()),
  );
  registerFacetLoader('facet:outOfBounds', () =>
    import('@ffacet/algorithm-out-of-bounds').then((m) => m.registerOutOfBounds()),
  );
  registerFacetLoader('facet:nodePointsNext', () =>
    import('@ffacet/algorithm-node-points-next').then((m) => m.registerNodePointsNext()),
  );
  registerFacetLoader('facet:traverseFromHead', () =>
    import('@ffacet/algorithm-traverse-from-head').then((m) => m.registerTraverseFromHead()),
  );
  registerFacetLoader('facet:relinkInsert', () =>
    import('@ffacet/algorithm-relink-insert').then((m) => m.registerRelinkInsert()),
  );
  registerFacetLoader('facet:lostLink', () =>
    import('@ffacet/algorithm-lost-link').then((m) => m.registerLostLink()),
  );
  registerFacetLoader('facet:pushPopTop', () =>
    import('@ffacet/algorithm-push-pop-top').then((m) => m.registerPushPopTop()),
  );

  registerFacetLoader('facet:signatureKeyDirection', () =>
    import('@ffacet/algorithm-signature-key-direction').then((m) =>
      m.registerSignatureKeyDirection(),
    ),
  );
  registerFacetLoader('facet:signatureOnHash', () =>
    import('@ffacet/algorithm-signature-on-hash').then((m) => m.registerSignatureOnHash()),
  );
  registerFacetLoader('facet:linearRegression', () =>
    import('@ffacet/algorithm-linear-regression').then((m) => m.registerLinearRegression()),
  );
  registerFacetLoader('facet:contextSwitching', () =>
    import('@ffacet/algorithm-context-switching').then((m) => m.registerContextSwitching()),
  );
  registerFacetLoader('facet:matrixTransform2d', () =>
    import('@ffacet/algorithm-matrix-transform-2d').then((m) => m.registerMatrixTransform2d()),
  );
  registerFacetLoader('facet:ipRouting', () =>
    import('@ffacet/algorithm-ip-routing').then((m) => m.registerIpRouting()),
  );
  registerFacetLoader('facet:compareAndSwap', () =>
    import('@ffacet/algorithm-compare-and-swap').then((m) => m.registerCompareAndSwap()),
  );
  registerFacetLoader('facet:sortStability', () =>
    import('@ffacet/algorithm-sort-stability').then((m) => m.registerSortStability()),
  );
  registerFacetLoader('facet:inPlaceVsExtra', () =>
    import('@ffacet/algorithm-in-place-vs-extra').then((m) => m.registerInPlaceVsExtra()),
  );
  registerFacetLoader('facet:bubbleAdjacentSwap', () =>
    import('@ffacet/algorithm-bubble-adjacent-swap').then((m) => m.registerBubbleAdjacentSwap()),
  );
  registerFacetLoader('facet:selectMinEachPass', () =>
    import('@ffacet/algorithm-select-min-each-pass').then((m) => m.registerSelectMinEachPass()),
  );
  registerFacetLoader('facet:insertIntoSortedPart', () =>
    import('@ffacet/algorithm-insert-into-sorted-part').then((m) => m.registerInsertIntoSortedPart()),
  );
  registerFacetLoader('facet:splitUntilOne', () =>
    import('@ffacet/algorithm-split-until-one').then((m) => m.registerSplitUntilOne()),
  );
  registerFacetLoader('facet:mergeTwoSorted', () =>
    import('@ffacet/algorithm-merge-two-sorted').then((m) => m.registerMergeTwoSorted()),
  );
  registerFacetLoader('facet:partitionAroundPivot', () =>
    import('@ffacet/algorithm-partition-around-pivot').then((m) => m.registerPartitionAroundPivot()),
  );
  registerFacetLoader('facet:pivotChoiceMatters', () =>
    import('@ffacet/algorithm-pivot-choice-matters').then((m) => m.registerPivotChoiceMatters()),
  );
  registerFacetLoader('facet:heapSortExtract', () =>
    import('@ffacet/algorithm-heap-sort-extract').then((m) => m.registerHeapSortExtract()),
  );
  registerFacetLoader('facet:countThenPlace', () =>
    import('@ffacet/algorithm-count-then-place').then((m) => m.registerCountThenPlace()),
  );
  registerFacetLoader('facet:digitByDigit', () =>
    import('@ffacet/algorithm-digit-by-digit').then((m) => m.registerDigitByDigit()),
  );
  registerFacetLoader('facet:gapShrink', () =>
    import('@ffacet/algorithm-gap-shrink').then((m) => m.registerGapShrink()),
  );
  registerFacetLoader('facet:scanUntilFound', () =>
    import('@ffacet/algorithm-scan-until-found').then((m) => m.registerScanUntilFound()),
  );
  registerFacetLoader('facet:halveTheRange', () =>
    import('@ffacet/algorithm-halve-the-range').then((m) => m.registerHalveTheRange()),
  );
  registerFacetLoader('facet:requiresSorted', () =>
    import('@ffacet/algorithm-requires-sorted').then((m) => m.registerRequiresSorted()),
  );
  registerFacetLoader('facet:guessByValue', () =>
    import('@ffacet/algorithm-guess-by-value').then((m) => m.registerGuessByValue()),
  );
  registerFacetLoader('facet:divideConquerCombine', () =>
    import('@ffacet/algorithm-divide-conquer-combine').then((m) => m.registerDivideConquerCombine()),
  );
  registerFacetLoader('facet:overlappingSubproblems', () =>
    import('@ffacet/algorithm-overlapping-subproblems').then((m) => m.registerOverlappingSubproblems()),
  );
  registerFacetLoader('facet:memoWriteOnce', () =>
    import('@ffacet/algorithm-memo-write-once').then((m) => m.registerMemoWriteOnce()),
  );
  registerFacetLoader('facet:bottomUpTable', () =>
    import('@ffacet/algorithm-bottom-up-table').then((m) => m.registerBottomUpTable()),
  );
  registerFacetLoader('facet:takeBestNow', () =>
    import('@ffacet/algorithm-take-best-now').then((m) => m.registerTakeBestNow()),
  );
  registerFacetLoader('facet:greedyCanFail', () =>
    import('@ffacet/algorithm-greedy-can-fail').then((m) => m.registerGreedyCanFail()),
  );
  registerFacetLoader('facet:tryAndUndo', () =>
    import('@ffacet/algorithm-try-and-undo').then((m) => m.registerTryAndUndo()),
  );
  registerFacetLoader('facet:pruneBranch', () =>
    import('@ffacet/algorithm-prune-branch').then((m) => m.registerPruneBranch()),
  );
  registerFacetLoader('facet:boundAndCut', () =>
    import('@ffacet/algorithm-bound-and-cut').then((m) => m.registerBoundAndCut()),
  );
  registerFacetLoader('facet:mergeSort', () =>
    import('@ffacet/algorithm-merge-sort').then((m) => m.registerMergeSort()),
  );
  registerFacetLoader('facet:quickSort', () =>
    import('@ffacet/algorithm-quick-sort').then((m) => m.registerQuickSort()),
  );
  registerFacetLoader('facet:countingSort', () =>
    import('@ffacet/algorithm-counting-sort').then((m) => m.registerCountingSort()),
  );
  registerFacetLoader('facet:radixSort', () =>
    import('@ffacet/algorithm-radix-sort').then((m) => m.registerRadixSort()),
  );
  registerFacetLoader('facet:selectionSort', () =>
    import('@ffacet/algorithm-selection-sort').then((m) => m.registerSelectionSort()),
  );
  registerFacetLoader('facet:insertionSort', () =>
    import('@ffacet/algorithm-insertion-sort').then((m) => m.registerInsertionSort()),
  );
  registerFacetLoader('facet:shellSort', () =>
    import('@ffacet/algorithm-shell-sort').then((m) => m.registerShellSort()),
  );
  registerFacetLoader('facet:heapSort', () =>
    import('@ffacet/algorithm-heap-sort').then((m) => m.registerHeapSort()),
  );
  registerFacetLoader('facet:binarySearch', () =>
    import('@ffacet/algorithm-binary-search').then((m) => m.registerBinarySearch()),
  );
  registerFacetLoader('facet:linearSearch', () =>
    import('@ffacet/algorithm-linear-search').then((m) => m.registerLinearSearch()),
  );
  registerFacetLoader('facet:interpolationSearch', () =>
    import('@ffacet/algorithm-interpolation-search').then((m) => m.registerInterpolationSearch()),
  );
  registerFacetLoader('facet:dynamicProgramming', () =>
    import('@ffacet/algorithm-dynamic-programming').then((m) => m.registerDynamicProgramming()),
  );
  registerFacetLoader('facet:greedy', () =>
    import('@ffacet/algorithm-greedy').then((m) => m.registerGreedy()),
  );
  registerFacetLoader('facet:backtracking', () =>
    import('@ffacet/algorithm-backtracking').then((m) => m.registerBacktracking()),
  );
  registerFacetLoader('facet:branchAndBound', () =>
    import('@ffacet/algorithm-branch-and-bound').then((m) => m.registerBranchAndBound()),
  );

  // 그래프 조각 — 표현 · 순회 · 위상 정렬 · 최단 경로의 한 대목씩.
  registerFacetLoader('facet:oneWayEdge', () =>
    import('@ffacet/algorithm-one-way-edge').then((m) => m.registerOneWayEdge()),
  );
  registerFacetLoader('facet:fewerHopsNotShorter', () =>
    import('@ffacet/algorithm-fewer-hops-not-shorter').then((m) => m.registerFewerHopsNotShorter()),
  );
  registerFacetLoader('facet:queueVsStackOrder', () =>
    import('@ffacet/algorithm-queue-vs-stack-order').then((m) => m.registerQueueVsStackOrder()),
  );
  registerFacetLoader('facet:markVisitedOrLoop', () =>
    import('@ffacet/algorithm-mark-visited-or-loop').then((m) => m.registerMarkVisitedOrLoop()),
  );
  registerFacetLoader('facet:diveThenBacktrack', () =>
    import('@ffacet/algorithm-dive-then-backtrack').then((m) => m.registerDiveThenBacktrack()),
  );
  registerFacetLoader('facet:separateComponents', () =>
    import('@ffacet/algorithm-separate-components').then((m) => m.registerSeparateComponents()),
  );
  registerFacetLoader('facet:twoColorConflict', () =>
    import('@ffacet/algorithm-two-color-conflict').then((m) => m.registerTwoColorConflict()),
  );
  registerFacetLoader('facet:indegreeZeroFirst', () =>
    import('@ffacet/algorithm-indegree-zero-first').then((m) => m.registerIndegreeZeroFirst()),
  );
  registerFacetLoader('facet:relaxShorterPath', () =>
    import('@ffacet/algorithm-relax-shorter-path').then((m) => m.registerRelaxShorterPath()),
  );
  registerFacetLoader('facet:cycleBlocksOrder', () =>
    import('@ffacet/algorithm-cycle-blocks-order').then((m) => m.registerCycleBlocksOrder()),
  );

  // 그래프 조각 2차 — 최단 경로 · 최소 신장 트리 · 강한 연결 · 최대 유량.
  registerFacetLoader('facet:pickNearestUnsettled', () =>
    import('@ffacet/algorithm-pick-nearest-unsettled').then((m) => m.registerPickNearestUnsettled()),
  );
  registerFacetLoader('facet:negativeEdgeBreaks', () =>
    import('@ffacet/algorithm-negative-edge-breaks').then((m) => m.registerNegativeEdgeBreaks()),
  );
  registerFacetLoader('facet:repeatRelaxAll', () =>
    import('@ffacet/algorithm-repeat-relax-all').then((m) => m.registerRepeatRelaxAll()),
  );
  registerFacetLoader('facet:oneMoreRoundDrops', () =>
    import('@ffacet/algorithm-one-more-round-drops').then((m) => m.registerOneMoreRoundDrops()),
  );
  registerFacetLoader('facet:throughMiddleNode', () =>
    import('@ffacet/algorithm-through-middle-node').then((m) => m.registerThroughMiddleNode()),
  );
  registerFacetLoader('facet:growOneTree', () =>
    import('@ffacet/algorithm-grow-one-tree').then((m) => m.registerGrowOneTree()),
  );
  registerFacetLoader('facet:sortEdgesAvoidCycle', () =>
    import('@ffacet/algorithm-sort-edges-avoid-cycle').then((m) => m.registerSortEdgesAvoidCycle()),
  );
  registerFacetLoader('facet:mutuallyReachable', () =>
    import('@ffacet/algorithm-mutually-reachable').then((m) => m.registerMutuallyReachable()),
  );
  registerFacetLoader('facet:bottleneckSetsFlow', () =>
    import('@ffacet/algorithm-bottleneck-sets-flow').then((m) => m.registerBottleneckSetsFlow()),
  );
  registerFacetLoader('facet:undoByBackEdge', () =>
    import('@ffacet/algorithm-undo-by-back-edge').then((m) => m.registerUndoByBackEdge()),
  );
  registerFacetLoader('facet:heuristicGuides', () =>
    import('@ffacet/algorithm-heuristic-guides').then((m) => m.registerHeuristicGuides()),
  );

  // 그래프 완제품 1차 — 최단 경로 셋 · 깊이 우선 · 위상 정렬.
  registerFacetLoader('facet:floydWarshall', () =>
    import('@ffacet/algorithm-floyd-warshall').then((m) => m.registerFloydWarshall()),
  );
  registerFacetLoader('facet:bellmanFord', () =>
    import('@ffacet/algorithm-bellman-ford').then((m) => m.registerBellmanFord()),
  );
  registerFacetLoader('facet:dijkstra', () =>
    import('@ffacet/algorithm-dijkstra').then((m) => m.registerDijkstra()),
  );
  registerFacetLoader('facet:dfs', () =>
    import('@ffacet/algorithm-dfs').then((m) => m.registerDfs()),
  );
  registerFacetLoader('facet:topologicalSort', () =>
    import('@ffacet/algorithm-topological-sort').then((m) => m.registerTopologicalSort()),
  );

  // 그래프 완제품 2차 — 최소 신장 트리 둘 · 강한 연결 · 최대 유량.
  registerFacetLoader('facet:primMst', () =>
    import('@ffacet/algorithm-prim-mst').then((m) => m.registerPrimMst()),
  );
  registerFacetLoader('facet:kruskalMst', () =>
    import('@ffacet/algorithm-kruskal-mst').then((m) => m.registerKruskalMst()),
  );
  registerFacetLoader('facet:scc', () =>
    import('@ffacet/algorithm-scc').then((m) => m.registerScc()),
  );
  registerFacetLoader('facet:maxFlow', () =>
    import('@ffacet/algorithm-max-flow').then((m) => m.registerMaxFlow()),
  );

  // 지도학습 조각 1차 — 선형 회귀 둘 · 로지스틱 둘 · k-NN 둘 · 의사결정 트리 하나.
  registerFacetLoader('facet:residualDistance', () =>
    import('@ffacet/algorithm-residual-distance').then((m) => m.registerResidualDistance()),
  );
  registerFacetLoader('facet:leastSquares', () =>
    import('@ffacet/algorithm-least-squares').then((m) => m.registerLeastSquares()),
  );
  registerFacetLoader('facet:squashToProbability', () =>
    import('@ffacet/algorithm-squash-to-probability').then((m) => m.registerSquashToProbability()),
  );
  registerFacetLoader('facet:decisionBoundary', () =>
    import('@ffacet/algorithm-decision-boundary').then((m) => m.registerDecisionBoundary()),
  );
  registerFacetLoader('facet:voteByNeighbors', () =>
    import('@ffacet/algorithm-vote-by-neighbors').then((m) => m.registerVoteByNeighbors()),
  );
  registerFacetLoader('facet:kChangesBoundary', () =>
    import('@ffacet/algorithm-k-changes-boundary').then((m) => m.registerKChangesBoundary()),
  );
  registerFacetLoader('facet:splitByQuestion', () =>
    import('@ffacet/algorithm-split-by-question').then((m) => m.registerSplitByQuestion()),
  );

  // 지도학습 조각 2차 — 의사결정 트리 하나 · 랜덤 포레스트 둘 · SVM 셋.
  registerFacetLoader('facet:impurityDrops', () =>
    import('@ffacet/algorithm-impurity-drops').then((m) => m.registerImpurityDrops()),
  );
  registerFacetLoader('facet:baggingSample', () =>
    import('@ffacet/algorithm-bagging-sample').then((m) => m.registerBaggingSample()),
  );
  registerFacetLoader('facet:manyTreesVote', () =>
    import('@ffacet/algorithm-many-trees-vote').then((m) => m.registerManyTreesVote()),
  );
  registerFacetLoader('facet:widestMargin', () =>
    import('@ffacet/algorithm-widest-margin').then((m) => m.registerWidestMargin()),
  );
  registerFacetLoader('facet:supportVectorsOnly', () =>
    import('@ffacet/algorithm-support-vectors-only').then((m) => m.registerSupportVectorsOnly()),
  );
  registerFacetLoader('facet:kernelLifts', () =>
    import('@ffacet/algorithm-kernel-lifts').then((m) => m.registerKernelLifts()),
  );

  // 지도학습 완제품 1차 — 로지스틱 회귀 · k-NN · 의사결정 트리.
  registerFacetLoader('facet:logisticRegression', () =>
    import('@ffacet/algorithm-logistic-regression').then((m) => m.registerLogisticRegression()),
  );
  registerFacetLoader('facet:knn', () =>
    import('@ffacet/algorithm-knn').then((m) => m.registerKnn()),
  );
  registerFacetLoader('facet:decisionTree', () =>
    import('@ffacet/algorithm-decision-tree').then((m) => m.registerDecisionTree()),
  );

  // 지도학습 완제품 2차 — 랜덤 포레스트 · SVM. 이로써 지도 학습이 다 찼다.
  registerFacetLoader('facet:randomForest', () =>
    import('@ffacet/algorithm-random-forest').then((m) => m.registerRandomForest()),
  );
  registerFacetLoader('facet:svm', () =>
    import('@ffacet/algorithm-svm').then((m) => m.registerSvm()),
  );

  // 비지도학습 조각 1차 — k-평균 둘 · 계층 군집화 둘 · 밀도 기반 하나.
  registerFacetLoader('facet:assignThenMove', () =>
    import('@ffacet/algorithm-assign-then-move').then((m) => m.registerAssignThenMove()),
  );
  registerFacetLoader('facet:kMustBeGiven', () =>
    import('@ffacet/algorithm-k-must-be-given').then((m) => m.registerKMustBeGiven()),
  );
  registerFacetLoader('facet:mergeNearestPair', () =>
    import('@ffacet/algorithm-merge-nearest-pair').then((m) => m.registerMergeNearestPair()),
  );
  registerFacetLoader('facet:dendrogramCut', () =>
    import('@ffacet/algorithm-dendrogram-cut').then((m) => m.registerDendrogramCut()),
  );
  registerFacetLoader('facet:denseNeighborhood', () =>
    import('@ffacet/algorithm-dense-neighborhood').then((m) => m.registerDenseNeighborhood()),
  );

  // 비지도학습 조각 2차 — 잡음점 · 주성분 둘 · 차원 축소 둘. 비지도 조각 완결.
  registerFacetLoader('facet:noiseLeftOut', () =>
    import('@ffacet/algorithm-noise-left-out').then((m) => m.registerNoiseLeftOut()),
  );
  registerFacetLoader('facet:directionOfMostSpread', () =>
    import('@ffacet/algorithm-direction-of-most-spread').then((m) => m.registerDirectionOfMostSpread()),
  );
  registerFacetLoader('facet:projectAndLose', () =>
    import('@ffacet/algorithm-project-and-lose').then((m) => m.registerProjectAndLose()),
  );
  registerFacetLoader('facet:keepNeighborsClose', () =>
    import('@ffacet/algorithm-keep-neighbors-close').then((m) => m.registerKeepNeighborsClose()),
  );
  registerFacetLoader('facet:globalAndLocal', () =>
    import('@ffacet/algorithm-global-and-local').then((m) => m.registerGlobalAndLocal()),
  );

  // 비지도학습 완제품 1차 — k-평균 · 계층 군집화 · DBSCAN.
  registerFacetLoader('facet:kmeans', () =>
    import('@ffacet/algorithm-kmeans').then((m) => m.registerKmeans()),
  );
  registerFacetLoader('facet:hierarchical', () =>
    import('@ffacet/algorithm-hierarchical').then((m) => m.registerHierarchical()),
  );
  registerFacetLoader('facet:dbscan', () =>
    import('@ffacet/algorithm-dbscan').then((m) => m.registerDbscan()),
  );

  // 비지도학습 완제품 2차 — PCA · t-SNE.
  registerFacetLoader('facet:pca', () =>
    import('@ffacet/algorithm-pca').then((m) => m.registerPca()),
  );
  registerFacetLoader('facet:tsne', () =>
    import('@ffacet/algorithm-tsne').then((m) => m.registerTsne()),
  );

  // 확률적 자료구조 조각 열 — 블룸 3 · CMS 2 · HLL 2 · t-digest 1 · 스킵 리스트 2.
  registerFacetLoader('facet:severalHashesOneValue', () =>
    import('@ffacet/algorithm-several-hashes-one-value').then((m) =>
      m.registerSeveralHashesOneValue(),
    ),
  );
  registerFacetLoader('facet:wrongInOneDirection', () =>
    import('@ffacet/algorithm-wrong-in-one-direction').then((m) => m.registerWrongInOneDirection()),
  );
  registerFacetLoader('facet:cannotUnset', () =>
    import('@ffacet/algorithm-cannot-unset').then((m) => m.registerCannotUnset()),
  );
  registerFacetLoader('facet:trustTheSmallest', () =>
    import('@ffacet/algorithm-trust-the-smallest').then((m) => m.registerTrustTheSmallest()),
  );
  registerFacetLoader('facet:spaceErrorTradeoff', () =>
    import('@ffacet/algorithm-space-error-tradeoff').then((m) => m.registerSpaceErrorTradeoff()),
  );
  registerFacetLoader('facet:leadingZerosTell', () =>
    import('@ffacet/algorithm-leading-zeros-tell').then((m) => m.registerLeadingZerosTell()),
  );
  registerFacetLoader('facet:averageTheBuckets', () =>
    import('@ffacet/algorithm-average-the-buckets').then((m) => m.registerAverageTheBuckets()),
  );
  registerFacetLoader('facet:crowdTheTails', () =>
    import('@ffacet/algorithm-crowd-the-tails').then((m) => m.registerCrowdTheTails()),
  );
  registerFacetLoader('facet:skipALayer', () =>
    import('@ffacet/algorithm-skip-a-layer').then((m) => m.registerSkipALayer()),
  );
  registerFacetLoader('facet:coinFlipHeight', () =>
    import('@ffacet/algorithm-coin-flip-height').then((m) => m.registerCoinFlipHeight()),
  );

  // 확률적 자료구조 완제품 다섯 — 손잡이가 논증을 지는 reactive facet 들.
  registerFacetLoader('facet:bloomFilter', () =>
    import('@ffacet/algorithm-bloom-filter').then((m) => m.registerBloomFilter()),
  );
  registerFacetLoader('facet:countMinSketch', () =>
    import('@ffacet/algorithm-count-min-sketch').then((m) => m.registerCountMinSketch()),
  );
  registerFacetLoader('facet:hyperloglog', () =>
    import('@ffacet/algorithm-hyperloglog').then((m) => m.registerHyperloglog()),
  );
  registerFacetLoader('facet:skipList', () =>
    import('@ffacet/algorithm-skip-list').then((m) => m.registerSkipList()),
  );
  registerFacetLoader('facet:tDigest', () =>
    import('@ffacet/algorithm-t-digest').then((m) => m.registerTDigest()),
  );

  // 문자열 알고리즘 조각 열하나 — KMP 2 · Boyer-Moore 2 · Rabin-Karp 1 ·
  // 접미사 배열 1 · Z 1 · Aho-Corasick 2 · 편집 거리 2.
  registerFacetLoader('facet:naiveShiftByOne', () =>
    import('@ffacet/algorithm-naive-shift-by-one').then((m) => m.registerNaiveShiftByOne()),
  );
  registerFacetLoader('facet:prefixSuffixJump', () =>
    import('@ffacet/algorithm-prefix-suffix-jump').then((m) => m.registerPrefixSuffixJump()),
  );
  registerFacetLoader('facet:matchFromBack', () =>
    import('@ffacet/algorithm-match-from-back').then((m) => m.registerMatchFromBack()),
  );
  registerFacetLoader('facet:badCharSkip', () =>
    import('@ffacet/algorithm-bad-char-skip').then((m) => m.registerBadCharSkip()),
  );
  registerFacetLoader('facet:rollingHash', () =>
    import('@ffacet/algorithm-rolling-hash').then((m) => m.registerRollingHash()),
  );
  registerFacetLoader('facet:allSuffixesSorted', () =>
    import('@ffacet/algorithm-all-suffixes-sorted').then((m) => m.registerAllSuffixesSorted()),
  );
  registerFacetLoader('facet:matchLengthPerSpot', () =>
    import('@ffacet/algorithm-match-length-per-spot').then((m) => m.registerMatchLengthPerSpot()),
  );
  registerFacetLoader('facet:manyPatternsOnePass', () =>
    import('@ffacet/algorithm-many-patterns-one-pass').then((m) => m.registerManyPatternsOnePass()),
  );
  registerFacetLoader('facet:failLink', () =>
    import('@ffacet/algorithm-fail-link').then((m) => m.registerFailLink()),
  );
  registerFacetLoader('facet:editTableFill', () =>
    import('@ffacet/algorithm-edit-table-fill').then((m) => m.registerEditTableFill()),
  );
  registerFacetLoader('facet:threeEditChoices', () =>
    import('@ffacet/algorithm-three-edit-choices').then((m) => m.registerThreeEditChoices()),
  );

  // 문자열 알고리즘 완제품 일곱 — 위 조각 열하나를 잇는다. 일곱 다 손잡이가
  // 논증을 지고 코드 패널을 단다 (IR 이 배열·반복·조건으로 곧게 펴지는 배치라).
  registerFacetLoader('facet:kmp', () =>
    import('@ffacet/algorithm-kmp').then((m) => m.registerKmp()),
  );
  registerFacetLoader('facet:boyerMoore', () =>
    import('@ffacet/algorithm-boyer-moore').then((m) => m.registerBoyerMoore()),
  );
  registerFacetLoader('facet:rabinKarp', () =>
    import('@ffacet/algorithm-rabin-karp').then((m) => m.registerRabinKarp()),
  );
  registerFacetLoader('facet:suffixArray', () =>
    import('@ffacet/algorithm-suffix-array').then((m) => m.registerSuffixArray()),
  );
  registerFacetLoader('facet:zAlgorithm', () =>
    import('@ffacet/algorithm-z-algorithm').then((m) => m.registerZAlgorithm()),
  );
  registerFacetLoader('facet:ahoCorasick', () =>
    import('@ffacet/algorithm-aho-corasick').then((m) => m.registerAhoCorasick()),
  );
  registerFacetLoader('facet:editDistance', () =>
    import('@ffacet/algorithm-edit-distance').then((m) => m.registerEditDistance()),
  );

  // 수치 알고리즘 조각 셋 — 빠른 거듭제곱 1 · 소수 판정 1 · 행렬 곱셈 1.
  registerFacetLoader('facet:squareAndHalve', () =>
    import('@ffacet/algorithm-square-and-halve').then((m) => m.registerSquareAndHalve()),
  );
  registerFacetLoader('facet:divisorPairsSqrt', () =>
    import('@ffacet/algorithm-divisor-pairs-sqrt').then((m) => m.registerDivisorPairsSqrt()),
  );
  registerFacetLoader('facet:rowTimesColumn', () =>
    import('@ffacet/algorithm-row-times-column').then((m) => m.registerRowTimesColumn()),
  );

  // 수치 알고리즘 완제품 다섯 — 조각 셋을 잇고, euclidean·sieve 는 혼자 선다.
  registerFacetLoader('facet:euclidean', () =>
    import('@ffacet/algorithm-euclidean').then((m) => m.registerEuclidean()),
  );
  registerFacetLoader('facet:fastPower', () =>
    import('@ffacet/algorithm-fast-power').then((m) => m.registerFastPower()),
  );
  registerFacetLoader('facet:sieve', () =>
    import('@ffacet/algorithm-sieve').then((m) => m.registerSieve()),
  );
  registerFacetLoader('facet:primality', () =>
    import('@ffacet/algorithm-primality').then((m) => m.registerPrimality()),
  );
  registerFacetLoader('facet:matrixMul', () =>
    import('@ffacet/algorithm-matrix-mul').then((m) => m.registerMatrixMul()),
  );

  // 계산 복잡도 조각 다섯 — Big-O 2 · 점근 1 · P/NP 1 · 환원 1.
  registerFacetLoader('facet:growthOutpaces', () =>
    import('@ffacet/algorithm-growth-outpaces').then((m) => m.registerGrowthOutpaces()),
  );
  registerFacetLoader('facet:constantFades', () =>
    import('@ffacet/algorithm-constant-fades').then((m) => m.registerConstantFades()),
  );
  registerFacetLoader('facet:curvesCross', () =>
    import('@ffacet/algorithm-curves-cross').then((m) => m.registerCurvesCross()),
  );
  registerFacetLoader('facet:verifyVsFind', () =>
    import('@ffacet/algorithm-verify-vs-find').then((m) => m.registerVerifyVsFind()),
  );
  registerFacetLoader('facet:reduceToKnown', () =>
    import('@ffacet/algorithm-reduce-to-known').then((m) => m.registerReduceToKnown()),
  );

  // 계산 복잡도 완제품 셋 — reduction 은 잣대 둘이 약해 만들지 않았다.
  registerFacetLoader('facet:bigO', () =>
    import('@ffacet/algorithm-big-o').then((m) => m.registerBigO()),
  );
  registerFacetLoader('facet:asymptotic', () =>
    import('@ffacet/algorithm-asymptotic').then((m) => m.registerAsymptotic()),
  );
  registerFacetLoader('facet:pNp', () =>
    import('@ffacet/algorithm-p-np').then((m) => m.registerPNp()),
  );
  // 수와 비트 표현 조각 열 — 2의 보수 2 · 오버플로 2 · 부동소수점 3 · 비트 연산 3.
  registerFacetLoader('facet:bitMask', () =>
    import('@ffacet/algorithm-bit-mask').then((m) => m.registerBitMask()),
  );
  registerFacetLoader('facet:bitShift', () =>
    import('@ffacet/algorithm-bit-shift').then((m) => m.registerBitShift()),
  );
  registerFacetLoader('facet:byteOrder', () =>
    import('@ffacet/algorithm-byte-order').then((m) => m.registerByteOrder()),
  );
  registerFacetLoader('facet:mantissaAndExponent', () =>
    import('@ffacet/algorithm-mantissa-and-exponent').then((m) => m.registerMantissaAndExponent()),
  );
  registerFacetLoader('facet:negateAndAddOne', () =>
    import('@ffacet/algorithm-negate-and-add-one').then((m) => m.registerNegateAndAddOne()),
  );
  registerFacetLoader('facet:positionalValue', () =>
    import('@ffacet/algorithm-positional-value').then((m) => m.registerPositionalValue()),
  );
  registerFacetLoader('facet:signedWraparound', () =>
    import('@ffacet/algorithm-signed-wraparound').then((m) => m.registerSignedWraparound()),
  );
  registerFacetLoader('facet:silentTruncation', () =>
    import('@ffacet/algorithm-silent-truncation').then((m) => m.registerSilentTruncation()),
  );
  registerFacetLoader('facet:unevenFloatGaps', () =>
    import('@ffacet/algorithm-uneven-float-gaps').then((m) => m.registerUnevenFloatGaps()),
  );
  registerFacetLoader('facet:unrepresentableFraction', () =>
    import('@ffacet/algorithm-unrepresentable-fraction').then((m) => m.registerUnrepresentableFraction()),
  );

  // 캐시 계층 조각 아홉 — 캐시 라인 4 · 직접 사상 2 · 집합 연관 1 · 쓰기 정책 2.
  registerFacetLoader('facet:lineFill', () =>
    import('@ffacet/algorithm-line-fill').then((m) => m.registerLineFill()),
  );
  registerFacetLoader('facet:temporalLocality', () =>
    import('@ffacet/algorithm-temporal-locality').then((m) => m.registerTemporalLocality()),
  );
  registerFacetLoader('facet:spatialLocality', () =>
    import('@ffacet/algorithm-spatial-locality').then((m) => m.registerSpatialLocality()),
  );
  registerFacetLoader('facet:indexAndTag', () =>
    import('@ffacet/algorithm-index-and-tag').then((m) => m.registerIndexAndTag()),
  );
  registerFacetLoader('facet:conflictMiss', () =>
    import('@ffacet/algorithm-conflict-miss').then((m) => m.registerConflictMiss()),
  );
  registerFacetLoader('facet:associativityRelief', () =>
    import('@ffacet/algorithm-associativity-relief').then((m) => m.registerAssociativityRelief()),
  );
  registerFacetLoader('facet:latencyLadder', () =>
    import('@ffacet/algorithm-latency-ladder').then((m) => m.registerLatencyLadder()),
  );
  registerFacetLoader('facet:writeBackVsThrough', () =>
    import('@ffacet/algorithm-write-back-vs-through').then((m) => m.registerWriteBackVsThrough()),
  );
  registerFacetLoader('facet:falseSharing', () =>
    import('@ffacet/algorithm-false-sharing').then((m) => m.registerFalseSharing()),
  );

  // 수와 비트 표현 완제품 넷 — 손잡이가 모두 reactive 다 (S-piece 가 아니라
  // CoroutineMechanism 에 위젯 액션 지원이 없기 때문이다).
  registerFacetLoader('facet:twosComplement', () =>
    import('@ffacet/algorithm-twos-complement').then((m) => m.registerTwosComplement()),
  );
  registerFacetLoader('facet:floatingPoint', () =>
    import('@ffacet/algorithm-floating-point').then((m) => m.registerFloatingPoint()),
  );
  registerFacetLoader('facet:bitwiseOps', () =>
    import('@ffacet/algorithm-bitwise-ops').then((m) => m.registerBitwiseOps()),
  );
  registerFacetLoader('facet:integerOverflow', () =>
    import('@ffacet/algorithm-integer-overflow').then((m) => m.registerIntegerOverflow()),
  );

  // 캐시 계층 완제품 다섯 — 손잡이가 모두 reactive 다.
  registerFacetLoader('facet:cacheLine', () =>
    import('@ffacet/algorithm-cache-line').then((m) => m.registerCacheLine()),
  );
  registerFacetLoader('facet:directMappedCache', () =>
    import('@ffacet/algorithm-direct-mapped-cache').then((m) => m.registerDirectMappedCache()),
  );
  registerFacetLoader('facet:setAssociativeCache', () =>
    import('@ffacet/algorithm-set-associative-cache').then((m) => m.registerSetAssociativeCache()),
  );
  registerFacetLoader('facet:cacheReplacement', () =>
    import('@ffacet/algorithm-cache-replacement').then((m) => m.registerCacheReplacement()),
  );
  registerFacetLoader('facet:writePolicy', () =>
    import('@ffacet/algorithm-write-policy').then((m) => m.registerWritePolicy()),
  );
  registerFacetLoader('facet:betweenLetterAndWord', () =>
    import('@ffacet/algorithm-between-letter-and-word').then((m) => m.registerBetweenLetterAndWord()),
  );
  registerFacetLoader('facet:boundaryShift', () =>
    import('@ffacet/algorithm-boundary-shift').then((m) => m.registerBoundaryShift()),
  );
  registerFacetLoader('facet:mergeTheFrequentPair', () =>
    import('@ffacet/algorithm-merge-the-frequent-pair').then((m) => m.registerMergeTheFrequentPair()),
  );
  registerFacetLoader('facet:spaceIsPartOfIt', () =>
    import('@ffacet/algorithm-space-is-part-of-it').then((m) => m.registerSpaceIsPartOfIt()),
  );
  registerFacetLoader('facet:tokensPerLanguage', () =>
    import('@ffacet/algorithm-tokens-per-language').then((m) => m.registerTokensPerLanguage()),
  );
  registerFacetLoader('facet:unknownBecomesKnown', () =>
    import('@ffacet/algorithm-unknown-becomes-known').then((m) => m.registerUnknownBecomesKnown()),
  );
  registerFacetLoader('facet:bpeTraining', () =>
    import('@ffacet/algorithm-bpe-training').then((m) => m.registerBpeTraining()),
  );
  registerFacetLoader('facet:subwordSegmentation', () =>
    import('@ffacet/algorithm-subword-segmentation').then((m) => m.registerSubwordSegmentation()),
  );
  registerFacetLoader('facet:vocabulary', () =>
    import('@ffacet/algorithm-vocabulary').then((m) => m.registerVocabulary()),
  );
  registerFacetLoader('facet:angleNotLength', () =>
    import('@ffacet/algorithm-angle-not-length').then((m) => m.registerAngleNotLength()),
  );
  registerFacetLoader('facet:coarseThenFine', () =>
    import('@ffacet/algorithm-coarse-then-fine').then((m) => m.registerCoarseThenFine()),
  );
  registerFacetLoader('facet:compareWithAll', () =>
    import('@ffacet/algorithm-compare-with-all').then((m) => m.registerCompareWithAll()),
  );
  registerFacetLoader('facet:neighborsLinkedAhead', () =>
    import('@ffacet/algorithm-neighbors-linked-ahead').then((m) => m.registerNeighborsLinkedAhead()),
  );
  registerFacetLoader('facet:probeAFewCells', () =>
    import('@ffacet/algorithm-probe-a-few-cells').then((m) => m.registerProbeAFewCells()),
  );
  registerFacetLoader('facet:recallSpeedTradeoff', () =>
    import('@ffacet/algorithm-recall-speed-tradeoff').then((m) => m.registerRecallSpeedTradeoff()),
  );
  registerFacetLoader('facet:splitAndNumber', () =>
    import('@ffacet/algorithm-split-and-number').then((m) => m.registerSplitAndNumber()),
  );
  registerFacetLoader('facet:exhaustiveSearch', () =>
    import('@ffacet/algorithm-exhaustive-search').then((m) => m.registerExhaustiveSearch()),
  );
  registerFacetLoader('facet:hnsw', () =>
    import('@ffacet/algorithm-hnsw').then((m) => m.registerHnsw()),
  );
  registerFacetLoader('facet:invertedFileIndex', () =>
    import('@ffacet/algorithm-inverted-file-index').then((m) => m.registerInvertedFileIndex()),
  );
  registerFacetLoader('facet:productQuantization', () =>
    import('@ffacet/algorithm-product-quantization').then((m) => m.registerProductQuantization()),
  );
  registerFacetLoader('facet:vectorSimilarity', () =>
    import('@ffacet/algorithm-vector-similarity').then((m) => m.registerVectorSimilarity()),
  );

  registerFacetLoader('facet:stageOverlap', () =>
    import('@ffacet/algorithm-stage-overlap').then((m) => m.registerStageOverlap()),
  );
  registerFacetLoader('facet:throughputNotLatency', () =>
    import('@ffacet/algorithm-throughput-not-latency').then((m) => m.registerThroughputNotLatency()),
  );
  registerFacetLoader('facet:readBeforeWrite', () =>
    import('@ffacet/algorithm-read-before-write').then((m) => m.registerReadBeforeWrite()),
  );
  registerFacetLoader('facet:operandForwarding', () =>
    import('@ffacet/algorithm-operand-forwarding').then((m) => m.registerOperandForwarding()),
  );
  registerFacetLoader('facet:pipelineBubble', () =>
    import('@ffacet/algorithm-pipeline-bubble').then((m) => m.registerPipelineBubble()),
  );
  registerFacetLoader('facet:branchFlush', () =>
    import('@ffacet/algorithm-branch-flush').then((m) => m.registerBranchFlush()),
  );
  registerFacetLoader('facet:dualIssue', () =>
    import('@ffacet/algorithm-dual-issue').then((m) => m.registerDualIssue()),
  );
  registerFacetLoader('facet:readyFirst', () =>
    import('@ffacet/algorithm-ready-first').then((m) => m.registerReadyFirst()),
  );
  registerFacetLoader('facet:mispredictionPenalty', () =>
    import('@ffacet/algorithm-misprediction-penalty').then((m) => m.registerMispredictionPenalty()),
  );
  registerFacetLoader('facet:backwardTaken', () =>
    import('@ffacet/algorithm-backward-taken').then((m) => m.registerBackwardTaken()),
  );
  registerFacetLoader('facet:oneBitDoubleFault', () =>
    import('@ffacet/algorithm-one-bit-double-fault').then((m) => m.registerOneBitDoubleFault()),
  );
  registerFacetLoader('facet:fourStateHysteresis', () =>
    import('@ffacet/algorithm-four-state-hysteresis').then((m) => m.registerFourStateHysteresis()),
  );
  registerFacetLoader('facet:patternFromHistory', () =>
    import('@ffacet/algorithm-pattern-from-history').then((m) => m.registerPatternFromHistory()),
  );
  registerFacetLoader('facet:unpredictableBranch', () =>
    import('@ffacet/algorithm-unpredictable-branch').then((m) => m.registerUnpredictableBranch()),
  );
  registerFacetLoader('facet:paddingGap', () =>
    import('@ffacet/algorithm-padding-gap').then((m) => m.registerPaddingGap()),
  );
  registerFacetLoader('facet:fieldOrderSize', () =>
    import('@ffacet/algorithm-field-order-size').then((m) => m.registerFieldOrderSize()),
  );
  registerFacetLoader('facet:rowVsColumnWalk', () =>
    import('@ffacet/algorithm-row-vs-column-walk').then((m) => m.registerRowVsColumnWalk()),
  );
  registerFacetLoader('facet:strideAndMiss', () =>
    import('@ffacet/algorithm-stride-and-miss').then((m) => m.registerStrideAndMiss()),
  );
  registerFacetLoader('facet:fetchAhead', () =>
    import('@ffacet/algorithm-fetch-ahead').then((m) => m.registerFetchAhead()),
  );
  registerFacetLoader('facet:lanesInStep', () =>
    import('@ffacet/algorithm-lanes-in-step').then((m) => m.registerLanesInStep()),
  );
  registerFacetLoader('facet:fiveStagePipeline', () =>
    import('@ffacet/algorithm-five-stage-pipeline').then((m) => m.registerFiveStagePipeline()),
  );
  registerFacetLoader('facet:dataHazard', () =>
    import('@ffacet/algorithm-data-hazard').then((m) => m.registerDataHazard()),
  );
  registerFacetLoader('facet:controlHazard', () =>
    import('@ffacet/algorithm-control-hazard').then((m) => m.registerControlHazard()),
  );
  registerFacetLoader('facet:outOfOrderExecution', () =>
    import('@ffacet/algorithm-out-of-order-execution').then((m) => m.registerOutOfOrderExecution()),
  );
  registerFacetLoader('facet:staticPrediction', () =>
    import('@ffacet/algorithm-static-prediction').then((m) => m.registerStaticPrediction()),
  );
  registerFacetLoader('facet:saturatingCounter', () =>
    import('@ffacet/algorithm-saturating-counter').then((m) => m.registerSaturatingCounter()),
  );
  registerFacetLoader('facet:branchHistoryTable', () =>
    import('@ffacet/algorithm-branch-history-table').then((m) => m.registerBranchHistoryTable()),
  );
  registerFacetLoader('facet:structAlignment', () =>
    import('@ffacet/algorithm-struct-alignment').then((m) => m.registerStructAlignment()),
  );
  registerFacetLoader('facet:arrayTraversalOrder', () =>
    import('@ffacet/algorithm-array-traversal-order').then((m) => m.registerArrayTraversalOrder()),
  );
  registerFacetLoader('facet:prefetching', () =>
    import('@ffacet/algorithm-prefetching').then((m) => m.registerPrefetching()),
  );
  registerFacetLoader('facet:simd', () =>
    import('@ffacet/algorithm-simd').then((m) => m.registerSimd()),
  );
  registerFacetLoader('facet:whereToCut', () =>
    import('@ffacet/algorithm-where-to-cut').then((m) => m.registerWhereToCut()),
  );
  registerFacetLoader('facet:overlapTheSeam', () =>
    import('@ffacet/algorithm-overlap-the-seam').then((m) => m.registerOverlapTheSeam()),
  );
  registerFacetLoader('facet:sameWordVsSameMeaning', () =>
    import('@ffacet/algorithm-same-word-vs-same-meaning').then((m) => m.registerSameWordVsSameMeaning()),
  );
  registerFacetLoader('facet:fuseTwoRankings', () =>
    import('@ffacet/algorithm-fuse-two-rankings').then((m) => m.registerFuseTwoRankings()),
  );
  registerFacetLoader('facet:lookCloselyAtFew', () =>
    import('@ffacet/algorithm-look-closely-at-few').then((m) => m.registerLookCloselyAtFew()),
  );
  registerFacetLoader('facet:budgetRunsOut', () =>
    import('@ffacet/algorithm-budget-runs-out').then((m) => m.registerBudgetRunsOut()),
  );
  registerFacetLoader('facet:lostInTheMiddle', () =>
    import('@ffacet/algorithm-lost-in-the-middle').then((m) => m.registerLostInTheMiddle()),
  );
  registerFacetLoader('facet:alwaysTheHighest', () =>
    import('@ffacet/algorithm-always-the-highest').then((m) => m.registerAlwaysTheHighest()),
  );
  registerFacetLoader('facet:flattenOrSharpen', () =>
    import('@ffacet/algorithm-flatten-or-sharpen').then((m) => m.registerFlattenOrSharpen()),
  );
  registerFacetLoader('facet:penalizeRepeats', () =>
    import('@ffacet/algorithm-penalize-repeats').then((m) => m.registerPenalizeRepeats()),
  );
  registerFacetLoader('facet:cutTheTail', () =>
    import('@ffacet/algorithm-cut-the-tail').then((m) => m.registerCutTheTail()),
  );
  registerFacetLoader('facet:fillToAShare', () =>
    import('@ffacet/algorithm-fill-to-a-share').then((m) => m.registerFillToAShare()),
  );
  registerFacetLoader('facet:carrySeveralLines', () =>
    import('@ffacet/algorithm-carry-several-lines').then((m) => m.registerCarrySeveralLines()),
  );
  registerFacetLoader('facet:eraseTheImpossible', () =>
    import('@ffacet/algorithm-erase-the-impossible').then((m) => m.registerEraseTheImpossible()),
  );
  registerFacetLoader('facet:dontRecountThePast', () =>
    import('@ffacet/algorithm-dont-recount-the-past').then((m) => m.registerDontRecountThePast()),
  );
  registerFacetLoader('facet:cacheKeepsGrowing', () =>
    import('@ffacet/algorithm-cache-keeps-growing').then((m) => m.registerCacheKeepsGrowing()),
  );
  registerFacetLoader('facet:firstTokenVsRest', () =>
    import('@ffacet/algorithm-first-token-vs-rest').then((m) => m.registerFirstTokenVsRest()),
  );
  registerFacetLoader('facet:shortWaitsForLong', () =>
    import('@ffacet/algorithm-short-waits-for-long').then((m) => m.registerShortWaitsForLong()),
  );
  registerFacetLoader('facet:refillTheEmptySlot', () =>
    import('@ffacet/algorithm-refill-the-empty-slot').then((m) => m.registerRefillTheEmptySlot()),
  );
  registerFacetLoader('facet:draftThenVerify', () =>
    import('@ffacet/algorithm-draft-then-verify').then((m) => m.registerDraftThenVerify()),
  );
  registerFacetLoader('facet:chunking', () =>
    import('@ffacet/algorithm-chunking').then((m) => m.registerChunking()),
  );
  registerFacetLoader('facet:hybridSearch', () =>
    import('@ffacet/algorithm-hybrid-search').then((m) => m.registerHybridSearch()),
  );
  registerFacetLoader('facet:reranking', () =>
    import('@ffacet/algorithm-reranking').then((m) => m.registerReranking()),
  );
  registerFacetLoader('facet:contextAssembly', () =>
    import('@ffacet/algorithm-context-assembly').then((m) => m.registerContextAssembly()),
  );
  registerFacetLoader('facet:greedyDecoding', () =>
    import('@ffacet/algorithm-greedy-decoding').then((m) => m.registerGreedyDecoding()),
  );
  registerFacetLoader('facet:temperatureSampling', () =>
    import('@ffacet/algorithm-temperature-sampling').then((m) => m.registerTemperatureSampling()),
  );
  registerFacetLoader('facet:topKTopP', () =>
    import('@ffacet/algorithm-top-k-top-p').then((m) => m.registerTopKTopP()),
  );
  registerFacetLoader('facet:beamSearch', () =>
    import('@ffacet/algorithm-beam-search').then((m) => m.registerBeamSearch()),
  );
  registerFacetLoader('facet:kvCache', () =>
    import('@ffacet/algorithm-kv-cache').then((m) => m.registerKvCache()),
  );
  registerFacetLoader('facet:batchingAndPadding', () =>
    import('@ffacet/algorithm-batching-and-padding').then((m) => m.registerBatchingAndPadding()),
  );
  registerFacetLoader('facet:speculativeDecoding', () =>
    import('@ffacet/algorithm-speculative-decoding').then((m) => m.registerSpeculativeDecoding()),
  );
  registerFacetLoader('facet:branchTakeOnePath', () =>
    import('@ffacet/algorithm-branch-take-one-path').then((m) => m.registerBranchTakeOnePath()),
  );
  registerFacetLoader('facet:multiwayBranch', () =>
    import('@ffacet/algorithm-multiway-branch').then((m) => m.registerMultiwayBranch()),
  );
  registerFacetLoader('facet:loopBack', () =>
    import('@ffacet/algorithm-loop-back').then((m) => m.registerLoopBack()),
  );
  registerFacetLoader('facet:loopTermination', () =>
    import('@ffacet/algorithm-loop-termination').then((m) => m.registerLoopTermination()),
  );
  registerFacetLoader('facet:recursionSelfCall', () =>
    import('@ffacet/algorithm-recursion-self-call').then((m) => m.registerRecursionSelfCall()),
  );
  registerFacetLoader('facet:callStackUnwind', () =>
    import('@ffacet/algorithm-call-stack-unwind').then((m) => m.registerCallStackUnwind()),
  );
  registerFacetLoader('facet:baseCase', () =>
    import('@ffacet/algorithm-base-case').then((m) => m.registerBaseCase()),
  );
  registerFacetLoader('facet:exceptionPropagate', () =>
    import('@ffacet/algorithm-exception-propagate').then((m) => m.registerExceptionPropagate()),
  );
  registerFacetLoader('facet:passByValueVsReference', () =>
    import('@ffacet/algorithm-pass-by-value-vs-reference').then((m) => m.registerPassByValueVsReference()),
  );
  registerFacetLoader('facet:returnToCaller', () =>
    import('@ffacet/algorithm-return-to-caller').then((m) => m.registerReturnToCaller()),
  );
  registerFacetLoader('facet:closureCaptures', () =>
    import('@ffacet/algorithm-closure-captures').then((m) => m.registerClosureCaptures()),
  );
  registerFacetLoader('facet:functionAsValue', () =>
    import('@ffacet/algorithm-function-as-value').then((m) => m.registerFunctionAsValue()),
  );
  registerFacetLoader('facet:curryingPartial', () =>
    import('@ffacet/algorithm-currying-partial').then((m) => m.registerCurryingPartial()),
  );
  registerFacetLoader('facet:valueInPlace', () =>
    import('@ffacet/algorithm-value-in-place').then((m) => m.registerValueInPlace()),
  );
  registerFacetLoader('facet:referenceHoldsAddress', () =>
    import('@ffacet/algorithm-reference-holds-address').then((m) => m.registerReferenceHoldsAddress()),
  );
  registerFacetLoader('facet:aliasing', () =>
    import('@ffacet/algorithm-aliasing').then((m) => m.registerAliasing()),
  );
  registerFacetLoader('facet:narrowingLoss', () =>
    import('@ffacet/algorithm-narrowing-loss').then((m) => m.registerNarrowingLoss()),
  );
  registerFacetLoader('facet:shadowing', () =>
    import('@ffacet/algorithm-shadowing').then((m) => m.registerShadowing()),
  );
  registerFacetLoader('facet:scopeExit', () =>
    import('@ffacet/algorithm-scope-exit').then((m) => m.registerScopeExit()),
  );
  registerFacetLoader('facet:danglingReference', () =>
    import('@ffacet/algorithm-dangling-reference').then((m) => m.registerDanglingReference()),
  );
  registerFacetLoader('facet:pureSameOutput', () =>
    import('@ffacet/algorithm-pure-same-output').then((m) => m.registerPureSameOutput()),
  );
  registerFacetLoader('facet:noSideEffect', () =>
    import('@ffacet/algorithm-no-side-effect').then((m) => m.registerNoSideEffect()),
  );
  registerFacetLoader('facet:immutableCopy', () =>
    import('@ffacet/algorithm-immutable-copy').then((m) => m.registerImmutableCopy()),
  );
  registerFacetLoader('facet:mapOneByOne', () =>
    import('@ffacet/algorithm-map-one-by-one').then((m) => m.registerMapOneByOne()),
  );
  registerFacetLoader('facet:filterKeepSome', () =>
    import('@ffacet/algorithm-filter-keep-some').then((m) => m.registerFilterKeepSome()),
  );
  registerFacetLoader('facet:reduceFold', () =>
    import('@ffacet/algorithm-reduce-fold').then((m) => m.registerReduceFold()),
  );
  registerFacetLoader('facet:monadChainInBox', () =>
    import('@ffacet/algorithm-monad-chain-in-box').then((m) => m.registerMonadChainInBox()),
  );
  registerFacetLoader('facet:instantiateFromClass', () =>
    import('@ffacet/algorithm-instantiate-from-class').then((m) => m.registerInstantiateFromClass()),
  );
  registerFacetLoader('facet:methodLookupUp', () =>
    import('@ffacet/algorithm-method-lookup-up').then((m) => m.registerMethodLookupUp()),
  );
  registerFacetLoader('facet:dynamicDispatch', () =>
    import('@ffacet/algorithm-dynamic-dispatch').then((m) => m.registerDynamicDispatch()),
  );
  registerFacetLoader('facet:interfaceSlot', () =>
    import('@ffacet/algorithm-interface-slot').then((m) => m.registerInterfaceSlot()),
  );
  registerFacetLoader('facet:encapsulationBoundary', () =>
    import('@ffacet/algorithm-encapsulation-boundary').then((m) => m.registerEncapsulationBoundary()),
  );
  registerFacetLoader('facet:stackVsHeap', () =>
    import('@ffacet/algorithm-stack-vs-heap').then((m) => m.registerStackVsHeap()),
  );
  registerFacetLoader('facet:pointerDereference', () =>
    import('@ffacet/algorithm-pointer-dereference').then((m) => m.registerPointerDereference()),
  );
  registerFacetLoader('facet:gcReachableFromRoot', () =>
    import('@ffacet/algorithm-gc-reachable-from-root').then((m) => m.registerGcReachableFromRoot()),
  );
  registerFacetLoader('facet:refcountZero', () =>
    import('@ffacet/algorithm-refcount-zero').then((m) => m.registerRefcountZero()),
  );
  registerFacetLoader('facet:referenceCycle', () =>
    import('@ffacet/algorithm-reference-cycle').then((m) => m.registerReferenceCycle()),
  );
  registerFacetLoader('facet:manualFree', () =>
    import('@ffacet/algorithm-manual-free').then((m) => m.registerManualFree()),
  );
  registerFacetLoader('facet:doubleFree', () =>
    import('@ffacet/algorithm-double-free').then((m) => m.registerDoubleFree()),
  );
  registerFacetLoader('facet:memoryLeak', () =>
    import('@ffacet/algorithm-memory-leak').then((m) => m.registerMemoryLeak()),
  );
  registerFacetLoader('facet:loopVsRecursion', () =>
    import('@ffacet/algorithm-loop-vs-recursion').then((m) => m.registerLoopVsRecursion()),
  );
  registerFacetLoader('facet:copyVsShare', () =>
    import('@ffacet/algorithm-copy-vs-share').then((m) => m.registerCopyVsShare()),
  );
  registerFacetLoader('facet:polymorphism', () =>
    import('@ffacet/algorithm-polymorphism').then((m) => m.registerPolymorphism()),
  );
  registerFacetLoader('facet:pureFunction', () =>
    import('@ffacet/algorithm-pure-function').then((m) => m.registerPureFunction()),
  );
  registerFacetLoader('facet:mapFilterReduce', () =>
    import('@ffacet/algorithm-map-filter-reduce').then((m) => m.registerMapFilterReduce()),
  );
  registerFacetLoader('facet:tracingVsRefcount', () =>
    import('@ffacet/algorithm-tracing-vs-refcount').then((m) => m.registerTracingVsRefcount()),
  );
  registerFacetLoader('facet:allocateAndFree', () =>
    import('@ffacet/algorithm-allocate-and-free').then((m) => m.registerAllocateAndFree()),
  );
  registerFacetLoader('facet:stateTransitions', () =>
    import('@ffacet/algorithm-state-transitions').then((m) => m.registerStateTransitions()),
  );
  registerFacetLoader('facet:blockedWaitsEvent', () =>
    import('@ffacet/algorithm-blocked-waits-event').then((m) => m.registerBlockedWaitsEvent()),
  );
  registerFacetLoader('facet:saveAndRestore', () =>
    import('@ffacet/algorithm-save-and-restore').then((m) => m.registerSaveAndRestore()),
  );
  registerFacetLoader('facet:switchCosts', () =>
    import('@ffacet/algorithm-switch-costs').then((m) => m.registerSwitchCosts()),
  );
  registerFacetLoader('facet:pcbHoldsState', () =>
    import('@ffacet/algorithm-pcb-holds-state').then((m) => m.registerPcbHoldsState()),
  );
  registerFacetLoader('facet:transferWithoutCpu', () =>
    import('@ffacet/algorithm-transfer-without-cpu').then((m) => m.registerTransferWithoutCpu()),
  );
  registerFacetLoader('facet:interruptPreempts', () =>
    import('@ffacet/algorithm-interrupt-preempts').then((m) => m.registerInterruptPreempts()),
  );
  registerFacetLoader('facet:pollingVsInterrupt', () =>
    import('@ffacet/algorithm-polling-vs-interrupt').then((m) => m.registerPollingVsInterrupt()),
  );
  registerFacetLoader('facet:seekDistanceCosts', () =>
    import('@ffacet/algorithm-seek-distance-costs').then((m) => m.registerSeekDistanceCosts()),
  );
  registerFacetLoader('facet:elevatorSweep', () =>
    import('@ffacet/algorithm-elevator-sweep').then((m) => m.registerElevatorSweep()),
  );
  registerFacetLoader('facet:inodePointsBlocks', () =>
    import('@ffacet/algorithm-inode-points-blocks').then((m) => m.registerInodePointsBlocks()),
  );
  registerFacetLoader('facet:indirectBlock', () =>
    import('@ffacet/algorithm-indirect-block').then((m) => m.registerIndirectBlock()),
  );
  registerFacetLoader('facet:chainOfBlocks', () =>
    import('@ffacet/algorithm-chain-of-blocks').then((m) => m.registerChainOfBlocks()),
  );
  registerFacetLoader('facet:writeIntentFirst', () =>
    import('@ffacet/algorithm-write-intent-first').then((m) => m.registerWriteIntentFirst()),
  );
  registerFacetLoader('facet:replayAfterCrash', () =>
    import('@ffacet/algorithm-replay-after-crash').then((m) => m.registerReplayAfterCrash()),
  );
  registerFacetLoader('facet:pathResolution', () =>
    import('@ffacet/algorithm-path-resolution').then((m) => m.registerPathResolution()),
  );
  registerFacetLoader('facet:hardVsSoftLink', () =>
    import('@ffacet/algorithm-hard-vs-soft-link').then((m) => m.registerHardVsSoftLink()),
  );
  registerFacetLoader('facet:pageTableLookup', () =>
    import('@ffacet/algorithm-page-table-lookup').then((m) => m.registerPageTableLookup()),
  );
  registerFacetLoader('facet:fixedSizeFrames', () =>
    import('@ffacet/algorithm-fixed-size-frames').then((m) => m.registerFixedSizeFrames()),
  );
  registerFacetLoader('facet:tlbCachesTranslation', () =>
    import('@ffacet/algorithm-tlb-caches-translation').then((m) => m.registerTlbCachesTranslation()),
  );
  registerFacetLoader('facet:variableSizeSegments', () =>
    import('@ffacet/algorithm-variable-size-segments').then((m) => m.registerVariableSizeSegments()),
  );
  registerFacetLoader('facet:externalFragmentation', () =>
    import('@ffacet/algorithm-external-fragmentation').then((m) => m.registerExternalFragmentation()),
  );
  registerFacetLoader('facet:pageFault', () =>
    import('@ffacet/algorithm-page-fault').then((m) => m.registerPageFault()),
  );
  registerFacetLoader('facet:swapInOut', () =>
    import('@ffacet/algorithm-swap-in-out').then((m) => m.registerSwapInOut()),
  );
  registerFacetLoader('facet:thrashing', () =>
    import('@ffacet/algorithm-thrashing').then((m) => m.registerThrashing()),
  );
  registerFacetLoader('facet:evictLeastRecent', () =>
    import('@ffacet/algorithm-evict-least-recent').then((m) => m.registerEvictLeastRecent()),
  );
  registerFacetLoader('facet:recencyReorder', () =>
    import('@ffacet/algorithm-recency-reorder').then((m) => m.registerRecencyReorder()),
  );
  registerFacetLoader('facet:evictOldest', () =>
    import('@ffacet/algorithm-evict-oldest').then((m) => m.registerEvictOldest()),
  );
  registerFacetLoader('facet:beladyAnomaly', () =>
    import('@ffacet/algorithm-belady-anomaly').then((m) => m.registerBeladyAnomaly()),
  );
  registerFacetLoader('facet:secondChance', () =>
    import('@ffacet/algorithm-second-chance').then((m) => m.registerSecondChance()),
  );
  registerFacetLoader('facet:readyQueuePick', () =>
    import('@ffacet/algorithm-ready-queue-pick').then((m) => m.registerReadyQueuePick()),
  );
  registerFacetLoader('facet:turnaroundVsWait', () =>
    import('@ffacet/algorithm-turnaround-vs-wait').then((m) => m.registerTurnaroundVsWait()),
  );
  registerFacetLoader('facet:firstComeFirstRun', () =>
    import('@ffacet/algorithm-first-come-first-run').then((m) => m.registerFirstComeFirstRun()),
  );
  registerFacetLoader('facet:convoyEffect', () =>
    import('@ffacet/algorithm-convoy-effect').then((m) => m.registerConvoyEffect()),
  );
  registerFacetLoader('facet:shortestFirst', () =>
    import('@ffacet/algorithm-shortest-first').then((m) => m.registerShortestFirst()),
  );
  registerFacetLoader('facet:starvationOfLong', () =>
    import('@ffacet/algorithm-starvation-of-long').then((m) => m.registerStarvationOfLong()),
  );
  registerFacetLoader('facet:timeSliceRotate', () =>
    import('@ffacet/algorithm-time-slice-rotate').then((m) => m.registerTimeSliceRotate()),
  );
  registerFacetLoader('facet:quantumSizeTradeoff', () =>
    import('@ffacet/algorithm-quantum-size-tradeoff').then((m) => m.registerQuantumSizeTradeoff()),
  );
  registerFacetLoader('facet:priorityPreempt', () =>
    import('@ffacet/algorithm-priority-preempt').then((m) => m.registerPriorityPreempt()),
  );
  registerFacetLoader('facet:aging', () =>
    import('@ffacet/algorithm-aging').then((m) => m.registerAging()),
  );
  registerFacetLoader('facet:demoteOnOveruse', () =>
    import('@ffacet/algorithm-demote-on-overuse').then((m) => m.registerDemoteOnOveruse()),
  );
  registerFacetLoader('facet:virtualRuntime', () =>
    import('@ffacet/algorithm-virtual-runtime').then((m) => m.registerVirtualRuntime()),
  );
  registerFacetLoader('facet:interleaving', () =>
    import('@ffacet/algorithm-interleaving').then((m) => m.registerInterleaving()),
  );
  registerFacetLoader('facet:nonAtomicIncrement', () =>
    import('@ffacet/algorithm-non-atomic-increment').then((m) => m.registerNonAtomicIncrement()),
  );
  registerFacetLoader('facet:lostUpdate', () =>
    import('@ffacet/algorithm-lost-update').then((m) => m.registerLostUpdate()),
  );
  registerFacetLoader('facet:criticalSection', () =>
    import('@ffacet/algorithm-critical-section').then((m) => m.registerCriticalSection()),
  );
  registerFacetLoader('facet:lockExcludes', () =>
    import('@ffacet/algorithm-lock-excludes').then((m) => m.registerLockExcludes()),
  );
  registerFacetLoader('facet:countingPermits', () =>
    import('@ffacet/algorithm-counting-permits').then((m) => m.registerCountingPermits()),
  );
  registerFacetLoader('facet:waitAndSignal', () =>
    import('@ffacet/algorithm-wait-and-signal').then((m) => m.registerWaitAndSignal()),
  );
  registerFacetLoader('facet:holdAndWait', () =>
    import('@ffacet/algorithm-hold-and-wait').then((m) => m.registerHoldAndWait()),
  );
  registerFacetLoader('facet:noPreemption', () =>
    import('@ffacet/algorithm-no-preemption').then((m) => m.registerNoPreemption()),
  );
  registerFacetLoader('facet:waitCycle', () =>
    import('@ffacet/algorithm-wait-cycle').then((m) => m.registerWaitCycle()),
  );
  registerFacetLoader('facet:lockOrdering', () =>
    import('@ffacet/algorithm-lock-ordering').then((m) => m.registerLockOrdering()),
  );
  registerFacetLoader('facet:boundedBuffer', () =>
    import('@ffacet/algorithm-bounded-buffer').then((m) => m.registerBoundedBuffer()),
  );
  registerFacetLoader('facet:processState', () =>
    import('@ffacet/algorithm-process-state').then((m) => m.registerProcessState()),
  );
  registerFacetLoader('facet:schedulingPolicy', () =>
    import('@ffacet/algorithm-scheduling-policy').then((m) => m.registerSchedulingPolicy()),
  );
  registerFacetLoader('facet:roundRobinQuantum', () =>
    import('@ffacet/algorithm-round-robin-quantum').then((m) => m.registerRoundRobinQuantum()),
  );
  registerFacetLoader('facet:priorityAging', () =>
    import('@ffacet/algorithm-priority-aging').then((m) => m.registerPriorityAging()),
  );
  registerFacetLoader('facet:weightedFairShare', () =>
    import('@ffacet/algorithm-weighted-fair-share').then((m) => m.registerWeightedFairShare()),
  );
  registerFacetLoader('facet:mutex', () =>
    import('@ffacet/algorithm-mutex').then((m) => m.registerMutex()),
  );
  registerFacetLoader('facet:deadlock', () =>
    import('@ffacet/algorithm-deadlock').then((m) => m.registerDeadlock()),
  );
  registerFacetLoader('facet:producerConsumer', () =>
    import('@ffacet/algorithm-producer-consumer').then((m) => m.registerProducerConsumer()),
  );
  registerFacetLoader('facet:paging', () =>
    import('@ffacet/algorithm-paging').then((m) => m.registerPaging()),
  );
  registerFacetLoader('facet:segmentation', () =>
    import('@ffacet/algorithm-segmentation').then((m) => m.registerSegmentation()),
  );
  registerFacetLoader('facet:virtualMemory', () =>
    import('@ffacet/algorithm-virtual-memory').then((m) => m.registerVirtualMemory()),
  );
  registerFacetLoader('facet:pageReplacement', () =>
    import('@ffacet/algorithm-page-replacement').then((m) => m.registerPageReplacement()),
  );
  registerFacetLoader('facet:fileBlockPlacement', () =>
    import('@ffacet/algorithm-file-block-placement').then((m) => m.registerFileBlockPlacement()),
  );
  registerFacetLoader('facet:journaling', () =>
    import('@ffacet/algorithm-journaling').then((m) => m.registerJournaling()),
  );
  registerFacetLoader('facet:diskScheduling', () =>
    import('@ffacet/algorithm-disk-scheduling').then((m) => m.registerDiskScheduling()),
  );
  registerFacetLoader('facet:ioTransferModes', () =>
    import('@ffacet/algorithm-io-transfer-modes').then((m) => m.registerIoTransferModes()),
  );
  registerFacetLoader('facet:layerWrapsPayload', () =>
    import('@ffacet/algorithm-layer-wraps-payload').then((m) => m.registerLayerWrapsPayload()),
  );
  registerFacetLoader('facet:peerLayerTalk', () =>
    import('@ffacet/algorithm-peer-layer-talk').then((m) => m.registerPeerLayerTalk()),
  );
  registerFacetLoader('facet:bitsAsSignal', () =>
    import('@ffacet/algorithm-bits-as-signal').then((m) => m.registerBitsAsSignal()),
  );
  registerFacetLoader('facet:frameBoundary', () =>
    import('@ffacet/algorithm-frame-boundary').then((m) => m.registerFrameBoundary()),
  );
  registerFacetLoader('facet:hopByHop', () =>
    import('@ffacet/algorithm-hop-by-hop').then((m) => m.registerHopByHop()),
  );
  registerFacetLoader('facet:portDemultiplex', () =>
    import('@ffacet/algorithm-port-demultiplex').then((m) => m.registerPortDemultiplex()),
  );
  registerFacetLoader('facet:collisionAndBackoff', () =>
    import('@ffacet/algorithm-collision-and-backoff').then((m) => m.registerCollisionAndBackoff()),
  );
  registerFacetLoader('facet:macIsLocal', () =>
    import('@ffacet/algorithm-mac-is-local').then((m) => m.registerMacIsLocal()),
  );
  registerFacetLoader('facet:askWhoHas', () =>
    import('@ffacet/algorithm-ask-who-has').then((m) => m.registerAskWhoHas()),
  );
  registerFacetLoader('facet:arpCache', () =>
    import('@ffacet/algorithm-arp-cache').then((m) => m.registerArpCache()),
  );
  registerFacetLoader('facet:threeWaySync', () =>
    import('@ffacet/algorithm-three-way-sync').then((m) => m.registerThreeWaySync()),
  );
  registerFacetLoader('facet:sequenceNumber', () =>
    import('@ffacet/algorithm-sequence-number').then((m) => m.registerSequenceNumber()),
  );
  registerFacetLoader('facet:receiverWindow', () =>
    import('@ffacet/algorithm-receiver-window').then((m) => m.registerReceiverWindow()),
  );
  registerFacetLoader('facet:slowStart', () =>
    import('@ffacet/algorithm-slow-start').then((m) => m.registerSlowStart()),
  );
  registerFacetLoader('facet:backOffOnLoss', () =>
    import('@ffacet/algorithm-back-off-on-loss').then((m) => m.registerBackOffOnLoss()),
  );
  registerFacetLoader('facet:sawtooth', () =>
    import('@ffacet/algorithm-sawtooth').then((m) => m.registerSawtooth()),
  );
  registerFacetLoader('facet:sendAndForget', () =>
    import('@ffacet/algorithm-send-and-forget').then((m) => m.registerSendAndForget()),
  );
  registerFacetLoader('facet:sharedSecretInPublic', () =>
    import('@ffacet/algorithm-shared-secret-in-public').then((m) => m.registerSharedSecretInPublic()),
  );
  registerFacetLoader('facet:certificateChain', () =>
    import('@ffacet/algorithm-certificate-chain').then((m) => m.registerCertificateChain()),
  );
  registerFacetLoader('facet:tokenBearer', () =>
    import('@ffacet/algorithm-token-bearer').then((m) => m.registerTokenBearer()),
  );
  registerFacetLoader('facet:ruleMatchOrder', () =>
    import('@ffacet/algorithm-rule-match-order').then((m) => m.registerRuleMatchOrder()),
  );
  registerFacetLoader('facet:requestResponse', () =>
    import('@ffacet/algorithm-request-response').then((m) => m.registerRequestResponse()),
  );
  registerFacetLoader('facet:statelessNeedsToken', () =>
    import('@ffacet/algorithm-stateless-needs-token').then((m) => m.registerStatelessNeedsToken()),
  );
  registerFacetLoader('facet:delegateDownTheTree', () =>
    import('@ffacet/algorithm-delegate-down-the-tree').then((m) => m.registerDelegateDownTheTree()),
  );
  registerFacetLoader('facet:cacheTtl', () =>
    import('@ffacet/algorithm-cache-ttl').then((m) => m.registerCacheTtl()),
  );
  registerFacetLoader('facet:storeAndForward', () =>
    import('@ffacet/algorithm-store-and-forward').then((m) => m.registerStoreAndForward()),
  );
  registerFacetLoader('facet:controlAndDataChannel', () =>
    import('@ffacet/algorithm-control-and-data-channel').then((m) => m.registerControlAndDataChannel()),
  );
  registerFacetLoader('facet:upgradeThenKeepOpen', () =>
    import('@ffacet/algorithm-upgrade-then-keep-open').then((m) => m.registerUpgradeThenKeepOpen()),
  );
  registerFacetLoader('facet:longestPrefixMatch', () =>
    import('@ffacet/algorithm-longest-prefix-match').then((m) => m.registerLongestPrefixMatch()),
  );
  registerFacetLoader('facet:forwardingTable', () =>
    import('@ffacet/algorithm-forwarding-table').then((m) => m.registerForwardingTable()),
  );
  registerFacetLoader('facet:hopCountMetric', () =>
    import('@ffacet/algorithm-hop-count-metric').then((m) => m.registerHopCountMetric()),
  );
  registerFacetLoader('facet:countToInfinity', () =>
    import('@ffacet/algorithm-count-to-infinity').then((m) => m.registerCountToInfinity()),
  );
  registerFacetLoader('facet:linkStateFlood', () =>
    import('@ffacet/algorithm-link-state-flood').then((m) => m.registerLinkStateFlood()),
  );
  registerFacetLoader('facet:shortestPathTree', () =>
    import('@ffacet/algorithm-shortest-path-tree').then((m) => m.registerShortestPathTree()),
  );
  registerFacetLoader('facet:pathVectorPolicy', () =>
    import('@ffacet/algorithm-path-vector-policy').then((m) => m.registerPathVectorPolicy()),
  );
  registerFacetLoader('facet:rewriteAddressPort', () =>
    import('@ffacet/algorithm-rewrite-address-port').then((m) => m.registerRewriteAddressPort()),
  );
  registerFacetLoader('facet:natMappingTable', () =>
    import('@ffacet/algorithm-nat-mapping-table').then((m) => m.registerNatMappingTable()),
  );
  registerFacetLoader('facet:echoAndReply', () =>
    import('@ffacet/algorithm-echo-and-reply').then((m) => m.registerEchoAndReply()),
  );
  registerFacetLoader('facet:ttlExpiredReports', () =>
    import('@ffacet/algorithm-ttl-expired-reports').then((m) => m.registerTtlExpiredReports()),
  );
  registerFacetLoader('facet:physicalLayer', () =>
    import('@ffacet/algorithm-physical-layer').then((m) => m.registerPhysicalLayer()),
  );
  registerFacetLoader('facet:networkLayer', () =>
    import('@ffacet/algorithm-network-layer').then((m) => m.registerNetworkLayer()),
  );
  registerFacetLoader('facet:ethernet', () =>
    import('@ffacet/algorithm-ethernet').then((m) => m.registerEthernet()),
  );
  registerFacetLoader('facet:arp', () =>
    import('@ffacet/algorithm-arp').then((m) => m.registerArp()),
  );
  registerFacetLoader('facet:rip', () =>
    import('@ffacet/algorithm-rip').then((m) => m.registerRip()),
  );
  registerFacetLoader('facet:nat', () =>
    import('@ffacet/algorithm-nat').then((m) => m.registerNat()),
  );
  registerFacetLoader('facet:firewall', () =>
    import('@ffacet/algorithm-firewall').then((m) => m.registerFirewall()),
  );
  registerFacetLoader('facet:tcpHandshake', () =>
    import('@ffacet/algorithm-tcp-handshake').then((m) => m.registerTcpHandshake()),
  );
  registerFacetLoader('facet:congestionControl', () =>
    import('@ffacet/algorithm-congestion-control').then((m) => m.registerCongestionControl()),
  );
  registerFacetLoader('facet:http', () =>
    import('@ffacet/algorithm-http').then((m) => m.registerHttp()),
  );
  registerFacetLoader('facet:dns', () =>
    import('@ffacet/algorithm-dns').then((m) => m.registerDns()),
  );
  registerFacetLoader('facet:tlsHandshake', () =>
    import('@ffacet/algorithm-tls-handshake').then((m) => m.registerTlsHandshake()),
  );
  registerFacetLoader('facet:auth', () =>
    import('@ffacet/algorithm-auth').then((m) => m.registerAuth()),
  );
  registerFacetLoader('facet:insertUpdateDelete', () =>
    import('@ffacet/algorithm-insert-update-delete').then((m) => m.registerInsertUpdateDelete()),
  );
  registerFacetLoader('facet:groupThenAggregate', () =>
    import('@ffacet/algorithm-group-then-aggregate').then((m) => m.registerGroupThenAggregate()),
  );
  registerFacetLoader('facet:schemaDefinesShape', () =>
    import('@ffacet/algorithm-schema-defines-shape').then((m) => m.registerSchemaDefinesShape()),
  );
  registerFacetLoader('facet:matchOnKey', () =>
    import('@ffacet/algorithm-match-on-key').then((m) => m.registerMatchOnKey()),
  );
  registerFacetLoader('facet:keepUnmatched', () =>
    import('@ffacet/algorithm-keep-unmatched').then((m) => m.registerKeepUnmatched()),
  );
  registerFacetLoader('facet:allPairs', () =>
    import('@ffacet/algorithm-all-pairs').then((m) => m.registerAllPairs()),
  );
  registerFacetLoader('facet:queryInsideQuery', () =>
    import('@ffacet/algorithm-query-inside-query').then((m) => m.registerQueryInsideQuery()),
  );
  registerFacetLoader('facet:windowSlides', () =>
    import('@ffacet/algorithm-window-slides').then((m) => m.registerWindowSlides()),
  );
  registerFacetLoader('facet:nestedDocument', () =>
    import('@ffacet/algorithm-nested-document').then((m) => m.registerNestedDocument()),
  );
  registerFacetLoader('facet:keyToValue', () =>
    import('@ffacet/algorithm-key-to-value').then((m) => m.registerKeyToValue()),
  );
  registerFacetLoader('facet:columnOriented', () =>
    import('@ffacet/algorithm-column-oriented').then((m) => m.registerColumnOriented()),
  );
  registerFacetLoader('facet:traverseRelationships', () =>
    import('@ffacet/algorithm-traverse-relationships').then((m) => m.registerTraverseRelationships()),
  );
  registerFacetLoader('facet:sameAnswerDifferentPlan', () =>
    import('@ffacet/algorithm-same-answer-different-plan').then((m) => m.registerSameAnswerDifferentPlan()),
  );
  registerFacetLoader('facet:reorderJoins', () =>
    import('@ffacet/algorithm-reorder-joins').then((m) => m.registerReorderJoins()),
  );
  registerFacetLoader('facet:planIsATree', () =>
    import('@ffacet/algorithm-plan-is-a-tree').then((m) => m.registerPlanIsATree()),
  );
  registerFacetLoader('facet:estimateFromStats', () =>
    import('@ffacet/algorithm-estimate-from-stats').then((m) => m.registerEstimateFromStats()),
  );
  registerFacetLoader('facet:badEstimateBadPlan', () =>
    import('@ffacet/algorithm-bad-estimate-bad-plan').then((m) => m.registerBadEstimateBadPlan()),
  );
  registerFacetLoader('facet:primaryKeyIdentifies', () =>
    import('@ffacet/algorithm-primary-key-identifies').then((m) => m.registerPrimaryKeyIdentifies()),
  );
  registerFacetLoader('facet:foreignKeyPoints', () =>
    import('@ffacet/algorithm-foreign-key-points').then((m) => m.registerForeignKeyPoints()),
  );
  registerFacetLoader('facet:rowIsAFact', () =>
    import('@ffacet/algorithm-row-is-a-fact').then((m) => m.registerRowIsAFact()),
  );
  registerFacetLoader('facet:setOfRows', () =>
    import('@ffacet/algorithm-set-of-rows').then((m) => m.registerSetOfRows()),
  );
  registerFacetLoader('facet:updateAnomaly', () =>
    import('@ffacet/algorithm-update-anomaly').then((m) => m.registerUpdateAnomaly()),
  );
  registerFacetLoader('facet:atomicCell', () =>
    import('@ffacet/algorithm-atomic-cell').then((m) => m.registerAtomicCell()),
  );
  registerFacetLoader('facet:partialDependency', () =>
    import('@ffacet/algorithm-partial-dependency').then((m) => m.registerPartialDependency()),
  );
  registerFacetLoader('facet:transitiveDependency', () =>
    import('@ffacet/algorithm-transitive-dependency').then((m) => m.registerTransitiveDependency()),
  );
  registerFacetLoader('facet:determinantMustBeKey', () =>
    import('@ffacet/algorithm-determinant-must-be-key').then((m) => m.registerDeterminantMustBeKey()),
  );
  registerFacetLoader('facet:leavesLinked', () =>
    import('@ffacet/algorithm-leaves-linked').then((m) => m.registerLeavesLinked()),
  );
  registerFacetLoader('facet:allDataInLeaves', () =>
    import('@ffacet/algorithm-all-data-in-leaves').then((m) => m.registerAllDataInLeaves()),
  );
  registerFacetLoader('facet:exactMatchOnly', () =>
    import('@ffacet/algorithm-exact-match-only').then((m) => m.registerExactMatchOnly()),
  );
  registerFacetLoader('facet:bitPerRow', () =>
    import('@ffacet/algorithm-bit-per-row').then((m) => m.registerBitPerRow()),
  );
  registerFacetLoader('facet:bitwiseCombine', () =>
    import('@ffacet/algorithm-bitwise-combine').then((m) => m.registerBitwiseCombine()),
  );
  registerFacetLoader('facet:leftmostPrefix', () =>
    import('@ffacet/algorithm-leftmost-prefix').then((m) => m.registerLeftmostPrefix()),
  );
  registerFacetLoader('facet:indexCostsWrite', () =>
    import('@ffacet/algorithm-index-costs-write').then((m) => m.registerIndexCostsWrite()),
  );
  registerFacetLoader('facet:splitByKey', () =>
    import('@ffacet/algorithm-split-by-key').then((m) => m.registerSplitByKey()),
  );
  registerFacetLoader('facet:hotShard', () =>
    import('@ffacet/algorithm-hot-shard').then((m) => m.registerHotShard()),
  );
  registerFacetLoader('facet:copyToFollowers', () =>
    import('@ffacet/algorithm-copy-to-followers').then((m) => m.registerCopyToFollowers()),
  );
  registerFacetLoader('facet:replicationLag', () =>
    import('@ffacet/algorithm-replication-lag').then((m) => m.registerReplicationLag()),
  );
  registerFacetLoader('facet:partitionForcesChoice', () =>
    import('@ffacet/algorithm-partition-forces-choice').then((m) => m.registerPartitionForcesChoice()),
  );
  registerFacetLoader('facet:electALeader', () =>
    import('@ffacet/algorithm-elect-a-leader').then((m) => m.registerElectALeader()),
  );
  registerFacetLoader('facet:majorityDecides', () =>
    import('@ffacet/algorithm-majority-decides').then((m) => m.registerMajorityDecides()),
  );
  registerFacetLoader('facet:logReplicateInOrder', () =>
    import('@ffacet/algorithm-log-replicate-in-order').then((m) => m.registerLogReplicateInOrder()),
  );
  registerFacetLoader('facet:splitBrain', () =>
    import('@ffacet/algorithm-split-brain').then((m) => m.registerSplitBrain()),
  );
  registerFacetLoader('facet:proposeAndPromise', () =>
    import('@ffacet/algorithm-propose-and-promise').then((m) => m.registerProposeAndPromise()),
  );
  registerFacetLoader('facet:allOrNothing', () =>
    import('@ffacet/algorithm-all-or-nothing').then((m) => m.registerAllOrNothing()),
  );
  registerFacetLoader('facet:durableAfterCommit', () =>
    import('@ffacet/algorithm-durable-after-commit').then((m) => m.registerDurableAfterCommit()),
  );
  registerFacetLoader('facet:dirtyRead', () =>
    import('@ffacet/algorithm-dirty-read').then((m) => m.registerDirtyRead()),
  );
  registerFacetLoader('facet:nonRepeatableRead', () =>
    import('@ffacet/algorithm-non-repeatable-read').then((m) => m.registerNonRepeatableRead()),
  );
  registerFacetLoader('facet:phantomRead', () =>
    import('@ffacet/algorithm-phantom-read').then((m) => m.registerPhantomRead()),
  );
  registerFacetLoader('facet:sharedVsExclusive', () =>
    import('@ffacet/algorithm-shared-vs-exclusive').then((m) => m.registerSharedVsExclusive()),
  );
  registerFacetLoader('facet:lockWait', () =>
    import('@ffacet/algorithm-lock-wait').then((m) => m.registerLockWait()),
  );
  registerFacetLoader('facet:keepOldVersion', () =>
    import('@ffacet/algorithm-keep-old-version').then((m) => m.registerKeepOldVersion()),
  );
  registerFacetLoader('facet:readSeesSnapshot', () =>
    import('@ffacet/algorithm-read-sees-snapshot').then((m) => m.registerReadSeesSnapshot()),
  );
  registerFacetLoader('facet:growThenShrink', () =>
    import('@ffacet/algorithm-grow-then-shrink').then((m) => m.registerGrowThenShrink()),
  );
  registerFacetLoader('facet:normalForms', () =>
    import('@ffacet/algorithm-normal-forms').then((m) => m.registerNormalForms()),
  );
  registerFacetLoader('facet:dml', () =>
    import('@ffacet/algorithm-dml').then((m) => m.registerDml()),
  );
  registerFacetLoader('facet:joinKinds', () =>
    import('@ffacet/algorithm-join-kinds').then((m) => m.registerJoinKinds()),
  );
  registerFacetLoader('facet:subquery', () =>
    import('@ffacet/algorithm-subquery').then((m) => m.registerSubquery()),
  );
  registerFacetLoader('facet:windowFunction', () =>
    import('@ffacet/algorithm-window-function').then((m) => m.registerWindowFunction()),
  );
  registerFacetLoader('facet:indexChoice', () =>
    import('@ffacet/algorithm-index-choice').then((m) => m.registerIndexChoice()),
  );
  registerFacetLoader('facet:bitmapIndex', () =>
    import('@ffacet/algorithm-bitmap-index').then((m) => m.registerBitmapIndex()),
  );
  registerFacetLoader('facet:compositeIndex', () =>
    import('@ffacet/algorithm-composite-index').then((m) => m.registerCompositeIndex()),
  );
  registerFacetLoader('facet:optimizer', () =>
    import('@ffacet/algorithm-optimizer').then((m) => m.registerOptimizer()),
  );
  registerFacetLoader('facet:costModel', () =>
    import('@ffacet/algorithm-cost-model').then((m) => m.registerCostModel()),
  );
  registerFacetLoader('facet:columnFamily', () =>
    import('@ffacet/algorithm-column-family').then((m) => m.registerColumnFamily()),
  );
  registerFacetLoader('facet:acid', () =>
    import('@ffacet/algorithm-acid').then((m) => m.registerAcid()),
  );
  registerFacetLoader('facet:isolation', () =>
    import('@ffacet/algorithm-isolation').then((m) => m.registerIsolation()),
  );
  registerFacetLoader('facet:mvcc', () =>
    import('@ffacet/algorithm-mvcc').then((m) => m.registerMvcc()),
  );
  registerFacetLoader('facet:replication', () =>
    import('@ffacet/algorithm-replication').then((m) => m.registerReplication()),
  );
  registerFacetLoader('facet:sharding', () =>
    import('@ffacet/algorithm-sharding').then((m) => m.registerSharding()),
  );
  registerFacetLoader('facet:raft', () =>
    import('@ffacet/algorithm-raft').then((m) => m.registerRaft()),
  );
  registerFacetLoader('facet:paxos', () =>
    import('@ffacet/algorithm-paxos').then((m) => m.registerPaxos()),
  );
  registerFacetLoader('facet:documentKv', () =>
    import('@ffacet/algorithm-document-kv').then((m) => m.registerDocumentKv()),
  );
  registerFacetLoader('facet:graphDb', () =>
    import('@ffacet/algorithm-graph-db').then((m) => m.registerGraphDb()),
  );
  registerFacetLoader('facet:cascadePriority', () =>
    import('@ffacet/algorithm-cascade-priority').then((m) => m.registerCascadePriority()),
  );
  registerFacetLoader('facet:layoutThrash', () =>
    import('@ffacet/algorithm-layout-thrash').then((m) => m.registerLayoutThrash()),
  );
  registerFacetLoader('facet:repaintCost', () =>
    import('@ffacet/algorithm-repaint-cost').then((m) => m.registerRepaintCost()),
  );
  registerFacetLoader('facet:keyedReconciliation', () =>
    import('@ffacet/algorithm-keyed-reconciliation').then((m) => m.registerKeyedReconciliation()),
  );
  registerFacetLoader('facet:reactiveUpdates', () =>
    import('@ffacet/algorithm-reactive-updates').then((m) => m.registerReactiveUpdates()),
  );
  registerFacetLoader('facet:cooperativeYielding', () =>
    import('@ffacet/algorithm-cooperative-yielding').then((m) => m.registerCooperativeYielding()),
  );
  registerFacetLoader('facet:frameBudget', () =>
    import('@ffacet/algorithm-frame-budget').then((m) => m.registerFrameBudget()),
  );
  registerFacetLoader('facet:criticalPath', () =>
    import('@ffacet/algorithm-critical-path').then((m) => m.registerCriticalPath()),
  );
  registerFacetLoader('facet:twoTreesMeet', () =>
    import('@ffacet/algorithm-two-trees-meet').then((m) => m.registerTwoTreesMeet()),
  );
  registerFacetLoader('facet:selectorRightToLeft', () =>
    import('@ffacet/algorithm-selector-right-to-left').then((m) => m.registerSelectorRightToLeft()),
  );
  registerFacetLoader('facet:cascadeConflict', () =>
    import('@ffacet/algorithm-cascade-conflict').then((m) => m.registerCascadeConflict()),
  );
  registerFacetLoader('facet:oneGrowsRestShift', () =>
    import('@ffacet/algorithm-one-grows-rest-shift').then((m) => m.registerOneGrowsRestShift()),
  );
  registerFacetLoader('facet:forcedSyncLayout', () =>
    import('@ffacet/algorithm-forced-sync-layout').then((m) => m.registerForcedSyncLayout()),
  );
  registerFacetLoader('facet:stackOfSheets', () =>
    import('@ffacet/algorithm-stack-of-sheets').then((m) => m.registerStackOfSheets()),
  );
  registerFacetLoader('facet:layerPromotion', () =>
    import('@ffacet/algorithm-layer-promotion').then((m) => m.registerLayerPromotion()),
  );
  registerFacetLoader('facet:sixteenMilliseconds', () =>
    import('@ffacet/algorithm-sixteen-milliseconds').then((m) => m.registerSixteenMilliseconds()),
  );
  registerFacetLoader('facet:droppedFrame', () =>
    import('@ffacet/algorithm-dropped-frame').then((m) => m.registerDroppedFrame()),
  );
  registerFacetLoader('facet:justBeforePaint', () =>
    import('@ffacet/algorithm-just-before-paint').then((m) => m.registerJustBeforePaint()),
  );
  registerFacetLoader('facet:layoutPerFrame', () =>
    import('@ffacet/algorithm-layout-per-frame').then((m) => m.registerLayoutPerFrame()),
  );
  registerFacetLoader('facet:moveWithoutRepaint', () =>
    import('@ffacet/algorithm-move-without-repaint').then((m) => m.registerMoveWithoutRepaint()),
  );
  registerFacetLoader('facet:jankVsSlow', () =>
    import('@ffacet/algorithm-jank-vs-slow').then((m) => m.registerJankVsSlow()),
  );
  registerFacetLoader('facet:framesStackUp', () =>
    import('@ffacet/algorithm-frames-stack-up').then((m) => m.registerFramesStackUp()),
  );
  registerFacetLoader('facet:oneTurnAtATime', () =>
    import('@ffacet/algorithm-one-turn-at-a-time').then((m) => m.registerOneTurnAtATime()),
  );
  registerFacetLoader('facet:microtaskCutsIn', () =>
    import('@ffacet/algorithm-microtask-cuts-in').then((m) => m.registerMicrotaskCutsIn()),
  );
  registerFacetLoader('facet:microtaskStarvation', () =>
    import('@ffacet/algorithm-microtask-starvation').then((m) => m.registerMicrotaskStarvation()),
  );
  registerFacetLoader('facet:timerIsAFloor', () =>
    import('@ffacet/algorithm-timer-is-a-floor').then((m) => m.registerTimerIsAFloor()),
  );
  registerFacetLoader('facet:longTaskBlocks', () =>
    import('@ffacet/algorithm-long-task-blocks').then((m) => m.registerLongTaskBlocks()),
  );
  registerFacetLoader('facet:yieldToRender', () =>
    import('@ffacet/algorithm-yield-to-render').then((m) => m.registerYieldToRender()),
  );
  registerFacetLoader('facet:sideBySideTrees', () =>
    import('@ffacet/algorithm-side-by-side-trees').then((m) => m.registerSideBySideTrees()),
  );
  registerFacetLoader('facet:typeChangeRebuild', () =>
    import('@ffacet/algorithm-type-change-rebuild').then((m) => m.registerTypeChangeRebuild()),
  );
  registerFacetLoader('facet:missingKeyRemount', () =>
    import('@ffacet/algorithm-missing-key-remount').then((m) => m.registerMissingKeyRemount()),
  );
  registerFacetLoader('facet:keyReorder', () =>
    import('@ffacet/algorithm-key-reorder').then((m) => m.registerKeyReorder()),
  );
  registerFacetLoader('facet:readIsSubscribe', () =>
    import('@ffacet/algorithm-read-is-subscribe').then((m) => m.registerReadIsSubscribe()),
  );
  registerFacetLoader('facet:dirtyScan', () =>
    import('@ffacet/algorithm-dirty-scan').then((m) => m.registerDirtyScan()),
  );
  registerFacetLoader('facet:coalesceUpdates', () =>
    import('@ffacet/algorithm-coalesce-updates').then((m) => m.registerCoalesceUpdates()),
  );
  registerFacetLoader('facet:parserStops', () =>
    import('@ffacet/algorithm-parser-stops').then((m) => m.registerParserStops()),
  );
  registerFacetLoader('facet:styleBlocksPaint', () =>
    import('@ffacet/algorithm-style-blocks-paint').then((m) => m.registerStyleBlocksPaint()),
  );
  registerFacetLoader('facet:preloadHint', () =>
    import('@ffacet/algorithm-preload-hint').then((m) => m.registerPreloadHint()),
  );
  registerFacetLoader('facet:fontSwap', () =>
    import('@ffacet/algorithm-font-swap').then((m) => m.registerFontSwap()),
  );
  registerFacetLoader('facet:deferVsAsync', () =>
    import('@ffacet/algorithm-defer-vs-async').then((m) => m.registerDeferVsAsync()),
  );
  registerFacetLoader('facet:whatFirstPaintNeeds', () =>
    import('@ffacet/algorithm-what-first-paint-needs').then((m) => m.registerWhatFirstPaintNeeds()),
  );
  registerFacetLoader('facet:splitIntoTokens', () =>
    import('@ffacet/algorithm-split-into-tokens').then((m) => m.registerSplitIntoTokens()),
  );
  registerFacetLoader('facet:longestMatchWins', () =>
    import('@ffacet/algorithm-longest-match-wins').then((m) => m.registerLongestMatchWins()),
  );
  registerFacetLoader('facet:patternMatchesSet', () =>
    import('@ffacet/algorithm-pattern-matches-set').then((m) => m.registerPatternMatchesSet()),
  );
  registerFacetLoader('facet:backtrackOnFail', () =>
    import('@ffacet/algorithm-backtrack-on-fail').then((m) => m.registerBacktrackOnFail()),
  );
  registerFacetLoader('facet:stateEatsChar', () =>
    import('@ffacet/algorithm-state-eats-char').then((m) => m.registerStateEatsChar()),
  );
  registerFacetLoader('facet:acceptState', () =>
    import('@ffacet/algorithm-accept-state').then((m) => m.registerAcceptState()),
  );
  registerFacetLoader('facet:nfaToDfa', () =>
    import('@ffacet/algorithm-nfa-to-dfa').then((m) => m.registerNfaToDfa()),
  );
  registerFacetLoader('facet:ruleExpands', () =>
    import('@ffacet/algorithm-rule-expands').then((m) => m.registerRuleExpands()),
  );
  registerFacetLoader('facet:derivationTree', () =>
    import('@ffacet/algorithm-derivation-tree').then((m) => m.registerDerivationTree()),
  );
  registerFacetLoader('facet:oneFunctionPerRule', () =>
    import('@ffacet/algorithm-one-function-per-rule').then((m) => m.registerOneFunctionPerRule()),
  );
  registerFacetLoader('facet:lookaheadOne', () =>
    import('@ffacet/algorithm-lookahead-one').then((m) => m.registerLookaheadOne()),
  );
  registerFacetLoader('facet:shiftOrReduce', () =>
    import('@ffacet/algorithm-shift-or-reduce').then((m) => m.registerShiftOrReduce()),
  );
  registerFacetLoader('facet:parseConflict', () =>
    import('@ffacet/algorithm-parse-conflict').then((m) => m.registerParseConflict()),
  );
  registerFacetLoader('facet:treeDropsSyntax', () =>
    import('@ffacet/algorithm-tree-drops-syntax').then((m) => m.registerTreeDropsSyntax()),
  );
  registerFacetLoader('facet:typeFlowsUp', () =>
    import('@ffacet/algorithm-type-flows-up').then((m) => m.registerTypeFlowsUp()),
  );
  registerFacetLoader('facet:typeMismatch', () =>
    import('@ffacet/algorithm-type-mismatch').then((m) => m.registerTypeMismatch()),
  );
  registerFacetLoader('facet:resolveToDeclaration', () =>
    import('@ffacet/algorithm-resolve-to-declaration').then((m) => m.registerResolveToDeclaration()),
  );
  registerFacetLoader('facet:tablePerScope', () =>
    import('@ffacet/algorithm-table-per-scope').then((m) => m.registerTablePerScope()),
  );
  registerFacetLoader('facet:lowerToSimpler', () =>
    import('@ffacet/algorithm-lower-to-simpler').then((m) => m.registerLowerToSimpler()),
  );
  registerFacetLoader('facet:assignOnce', () =>
    import('@ffacet/algorithm-assign-once').then((m) => m.registerAssignOnce()),
  );
  registerFacetLoader('facet:phiMerges', () =>
    import('@ffacet/algorithm-phi-merges').then((m) => m.registerPhiMerges()),
  );
  registerFacetLoader('facet:basicBlock', () =>
    import('@ffacet/algorithm-basic-block').then((m) => m.registerBasicBlock()),
  );
  registerFacetLoader('facet:edgesAreJumps', () =>
    import('@ffacet/algorithm-edges-are-jumps').then((m) => m.registerEdgesAreJumps()),
  );
  registerFacetLoader('facet:valueFlowsToUse', () =>
    import('@ffacet/algorithm-value-flows-to-use').then((m) => m.registerValueFlowsToUse()),
  );
  registerFacetLoader('facet:foldAtCompile', () =>
    import('@ffacet/algorithm-fold-at-compile').then((m) => m.registerFoldAtCompile()),
  );
  registerFacetLoader('facet:unusedIsRemoved', () =>
    import('@ffacet/algorithm-unused-is-removed').then((m) => m.registerUnusedIsRemoved()),
  );
  registerFacetLoader('facet:hoistInvariant', () =>
    import('@ffacet/algorithm-hoist-invariant').then((m) => m.registerHoistInvariant()),
  );
  registerFacetLoader('facet:unrollLoop', () =>
    import('@ffacet/algorithm-unroll-loop').then((m) => m.registerUnrollLoop()),
  );
  registerFacetLoader('facet:pasteTheBody', () =>
    import('@ffacet/algorithm-paste-the-body').then((m) => m.registerPasteTheBody()),
  );
  registerFacetLoader('facet:inlineGrowsCode', () =>
    import('@ffacet/algorithm-inline-grows-code').then((m) => m.registerInlineGrowsCode()),
  );
  registerFacetLoader('facet:registersAreFew', () =>
    import('@ffacet/algorithm-registers-are-few').then((m) => m.registerRegistersAreFew()),
  );
  registerFacetLoader('facet:spillToMemory', () =>
    import('@ffacet/algorithm-spill-to-memory').then((m) => m.registerSpillToMemory()),
  );
  registerFacetLoader('facet:interferenceGraph', () =>
    import('@ffacet/algorithm-interference-graph').then((m) => m.registerInterferenceGraph()),
  );
  registerFacetLoader('facet:patternToInstruction', () =>
    import('@ffacet/algorithm-pattern-to-instruction').then((m) => m.registerPatternToInstruction()),
  );
  registerFacetLoader('facet:resolveSymbols', () =>
    import('@ffacet/algorithm-resolve-symbols').then((m) => m.registerResolveSymbols()),
  );
  registerFacetLoader('facet:relocateAddresses', () =>
    import('@ffacet/algorithm-relocate-addresses').then((m) => m.registerRelocateAddresses()),
  );
  registerFacetLoader('facet:regexBacktracking', () =>
    import('@ffacet/algorithm-regex-backtracking').then((m) => m.registerRegexBacktracking()),
  );
  registerFacetLoader('facet:finiteAutomata', () =>
    import('@ffacet/algorithm-finite-automata').then((m) => m.registerFiniteAutomata()),
  );
  registerFacetLoader('facet:parseTreeToAst', () =>
    import('@ffacet/algorithm-parse-tree-to-ast').then((m) => m.registerParseTreeToAst()),
  );
  registerFacetLoader('facet:recursiveDescent', () =>
    import('@ffacet/algorithm-recursive-descent').then((m) => m.registerRecursiveDescent()),
  );
  registerFacetLoader('facet:lrPrecedence', () =>
    import('@ffacet/algorithm-lr-precedence').then((m) => m.registerLrPrecedence()),
  );
  registerFacetLoader('facet:typeChecking', () =>
    import('@ffacet/algorithm-type-checking').then((m) => m.registerTypeChecking()),
  );
  registerFacetLoader('facet:scopeAndSymbols', () =>
    import('@ffacet/algorithm-scope-and-symbols').then((m) => m.registerScopeAndSymbols()),
  );
  registerFacetLoader('facet:ssaForm', () =>
    import('@ffacet/algorithm-ssa-form').then((m) => m.registerSsaForm()),
  );
  registerFacetLoader('facet:flowGraphs', () =>
    import('@ffacet/algorithm-flow-graphs').then((m) => m.registerFlowGraphs()),
  );
  registerFacetLoader('facet:foldAndSweep', () =>
    import('@ffacet/algorithm-fold-and-sweep').then((m) => m.registerFoldAndSweep()),
  );
  registerFacetLoader('facet:loopOptimization', () =>
    import('@ffacet/algorithm-loop-optimization').then((m) => m.registerLoopOptimization()),
  );
  registerFacetLoader('facet:inliningTradeoff', () =>
    import('@ffacet/algorithm-inlining-tradeoff').then((m) => m.registerInliningTradeoff()),
  );
  registerFacetLoader('facet:registerAllocation', () =>
    import('@ffacet/algorithm-register-allocation').then((m) => m.registerRegisterAllocation()),
  );
  registerFacetLoader('facet:instructionSelection', () =>
    import('@ffacet/algorithm-instruction-selection').then((m) => m.registerInstructionSelection()),
  );
  registerFacetLoader('facet:linker', () =>
    import('@ffacet/algorithm-linker').then((m) => m.registerLinker()),
  );
  registerFacetLoader('facet:ancestorAsReferee', () =>
    import('@ffacet/algorithm-ancestor-as-referee').then((m) => m.registerAncestorAsReferee()),
  );
  registerFacetLoader('facet:bisectHalving', () =>
    import('@ffacet/algorithm-bisect-halving').then((m) => m.registerBisectHalving()),
  );
  registerFacetLoader('facet:bothTouchedSameLine', () =>
    import('@ffacet/algorithm-both-touched-same-line').then((m) => m.registerBothTouchedSameLine()),
  );
  registerFacetLoader('facet:branchIsALabel', () =>
    import('@ffacet/algorithm-branch-is-a-label').then((m) => m.registerBranchIsALabel()),
  );
  registerFacetLoader('facet:diagonalIsFree', () =>
    import('@ffacet/algorithm-diagonal-is-free').then((m) => m.registerDiagonalIsFree()),
  );
  registerFacetLoader('facet:diamondDependency', () =>
    import('@ffacet/algorithm-diamond-dependency').then((m) => m.registerDiamondDependency()),
  );
  registerFacetLoader('facet:editScript', () =>
    import('@ffacet/algorithm-edit-script').then((m) => m.registerEditScript()),
  );
  registerFacetLoader('facet:fastForward', () =>
    import('@ffacet/algorithm-fast-forward').then((m) => m.registerFastForward()),
  );
  registerFacetLoader('facet:independentInParallel', () =>
    import('@ffacet/algorithm-independent-in-parallel').then((m) => m.registerIndependentInParallel()),
  );
  registerFacetLoader('facet:invalidationCascade', () =>
    import('@ffacet/algorithm-invalidation-cascade').then((m) => m.registerInvalidationCascade()),
  );
  registerFacetLoader('facet:keepTheCommon', () =>
    import('@ffacet/algorithm-keep-the-common').then((m) => m.registerKeepTheCommon()),
  );
  registerFacetLoader('facet:linesCoveredBranchNot', () =>
    import('@ffacet/algorithm-lines-covered-branch-not').then((m) => m.registerLinesCoveredBranchNot()),
  );
  registerFacetLoader('facet:linesYouSteppedOn', () =>
    import('@ffacet/algorithm-lines-you-stepped-on').then((m) => m.registerLinesYouSteppedOn()),
  );
  registerFacetLoader('facet:moveLooksLikeRewrite', () =>
    import('@ffacet/algorithm-move-looks-like-rewrite').then((m) => m.registerMoveLooksLikeRewrite()),
  );
  registerFacetLoader('facet:noOverlap', () =>
    import('@ffacet/algorithm-no-overlap').then((m) => m.registerNoOverlap()),
  );
  registerFacetLoader('facet:nobodyCanBeFirst', () =>
    import('@ffacet/algorithm-nobody-can-be-first').then((m) => m.registerNobodyCanBeFirst()),
  );
  registerFacetLoader('facet:oneSideChanged', () =>
    import('@ffacet/algorithm-one-side-changed').then((m) => m.registerOneSideChanged()),
  );
  registerFacetLoader('facet:onlyWhatChanged', () =>
    import('@ffacet/algorithm-only-what-changed').then((m) => m.registerOnlyWhatChanged()),
  );
  registerFacetLoader('facet:pathExplosion', () =>
    import('@ffacet/algorithm-path-explosion').then((m) => m.registerPathExplosion()),
  );
  registerFacetLoader('facet:pickOneOut', () =>
    import('@ffacet/algorithm-pick-one-out').then((m) => m.registerPickOneOut()),
  );
  registerFacetLoader('facet:pinWhatWasChosen', () =>
    import('@ffacet/algorithm-pin-what-was-chosen').then((m) => m.registerPinWhatWasChosen()),
  );
  registerFacetLoader('facet:rangeAndCandidates', () =>
    import('@ffacet/algorithm-range-and-candidates').then((m) => m.registerRangeAndCandidates()),
  );
  registerFacetLoader('facet:replayOnNewBase', () =>
    import('@ffacet/algorithm-replay-on-new-base').then((m) => m.registerReplayOnNewBase()),
  );
  registerFacetLoader('facet:shrinkToSmallest', () =>
    import('@ffacet/algorithm-shrink-to-smallest').then((m) => m.registerShrinkToSmallest()),
  );
  registerFacetLoader('facet:snapshotPointsBack', () =>
    import('@ffacet/algorithm-snapshot-points-back').then((m) => m.registerSnapshotPointsBack()),
  );
  registerFacetLoader('facet:survivingMutant', () =>
    import('@ffacet/algorithm-surviving-mutant').then((m) => m.registerSurvivingMutant()),
  );
  registerFacetLoader('facet:threeNumbers', () =>
    import('@ffacet/algorithm-three-numbers').then((m) => m.registerThreeNumbers()),
  );
  registerFacetLoader('facet:timestampVsFingerprint', () =>
    import('@ffacet/algorithm-timestamp-vs-fingerprint').then((m) => m.registerTimestampVsFingerprint()),
  );
  registerFacetLoader('facet:twoCopiesCoexist', () =>
    import('@ffacet/algorithm-two-copies-coexist').then((m) => m.registerTwoCopiesCoexist()),
  );
  registerFacetLoader('facet:unreachableSnapshot', () =>
    import('@ffacet/algorithm-unreachable-snapshot').then((m) => m.registerUnreachableSnapshot()),
  );
  registerFacetLoader('facet:whereTheyParted', () =>
    import('@ffacet/algorithm-where-they-parted').then((m) => m.registerWhereTheyParted()),
  );
  registerFacetLoader('facet:whichConditionDecided', () =>
    import('@ffacet/algorithm-which-condition-decided').then((m) => m.registerWhichConditionDecided()),
  );
  registerFacetLoader('facet:whoGoesFirst', () =>
    import('@ffacet/algorithm-who-goes-first').then((m) => m.registerWhoGoesFirst()),
  );
  registerFacetLoader('facet:myersDiff', () =>
    import('@ffacet/algorithm-myers-diff').then((m) => m.registerMyersDiff()),
  );
  registerFacetLoader('facet:threeWayMerge', () =>
    import('@ffacet/algorithm-three-way-merge').then((m) => m.registerThreeWayMerge()),
  );
  registerFacetLoader('facet:rebaseVsMerge', () =>
    import('@ffacet/algorithm-rebase-vs-merge').then((m) => m.registerRebaseVsMerge()),
  );
  registerFacetLoader('facet:historyBisect', () =>
    import('@ffacet/algorithm-history-bisect').then((m) => m.registerHistoryBisect()),
  );
  registerFacetLoader('facet:dependencyGraph', () =>
    import('@ffacet/algorithm-dependency-graph').then((m) => m.registerDependencyGraph()),
  );
  registerFacetLoader('facet:incrementalBuild', () =>
    import('@ffacet/algorithm-incremental-build').then((m) => m.registerIncrementalBuild()),
  );
  registerFacetLoader('facet:cacheInvalidation', () =>
    import('@ffacet/algorithm-cache-invalidation').then((m) => m.registerCacheInvalidation()),
  );
  registerFacetLoader('facet:semanticVersioning', () =>
    import('@ffacet/algorithm-semantic-versioning').then((m) => m.registerSemanticVersioning()),
  );
  registerFacetLoader('facet:dependencyResolution', () =>
    import('@ffacet/algorithm-dependency-resolution').then((m) => m.registerDependencyResolution()),
  );
  registerFacetLoader('facet:branchCoverage', () =>
    import('@ffacet/algorithm-branch-coverage').then((m) => m.registerBranchCoverage()),
  );
  registerFacetLoader('facet:addNoiseThenRemove', () =>
    import('@ffacet/algorithm-add-noise-then-remove').then((m) => m.registerAddNoiseThenRemove()),
  );
  registerFacetLoader('facet:attendToAllAtOnce', () =>
    import('@ffacet/algorithm-attend-to-all-at-once').then((m) => m.registerAttendToAllAtOnce()),
  );
  registerFacetLoader('facet:attentionWeights', () =>
    import('@ffacet/algorithm-attention-weights').then((m) => m.registerAttentionWeights()),
  );
  registerFacetLoader('facet:carryHiddenState', () =>
    import('@ffacet/algorithm-carry-hidden-state').then((m) => m.registerCarryHiddenState()),
  );
  registerFacetLoader('facet:cellCarriesLong', () =>
    import('@ffacet/algorithm-cell-carries-long').then((m) => m.registerCellCarriesLong()),
  );
  registerFacetLoader('facet:denoiseStepByStep', () =>
    import('@ffacet/algorithm-denoise-step-by-step').then((m) => m.registerDenoiseStepByStep()),
  );
  registerFacetLoader('facet:discountFuture', () =>
    import('@ffacet/algorithm-discount-future').then((m) => m.registerDiscountFuture()),
  );
  registerFacetLoader('facet:encodeToDistribution', () =>
    import('@ffacet/algorithm-encode-to-distribution').then((m) => m.registerEncodeToDistribution()),
  );
  registerFacetLoader('facet:exploreVsExploit', () =>
    import('@ffacet/algorithm-explore-vs-exploit').then((m) => m.registerExploreVsExploit()),
  );
  registerFacetLoader('facet:fewerGates', () =>
    import('@ffacet/algorithm-fewer-gates').then((m) => m.registerFewerGates()),
  );
  registerFacetLoader('facet:fieldGrowsWithDepth', () =>
    import('@ffacet/algorithm-field-grows-with-depth').then((m) => m.registerFieldGrowsWithDepth()),
  );
  registerFacetLoader('facet:filtersLearnEdges', () =>
    import('@ffacet/algorithm-filters-learn-edges').then((m) => m.registerFiltersLearnEdges()),
  );
  registerFacetLoader('facet:gateLetsThrough', () =>
    import('@ffacet/algorithm-gate-lets-through').then((m) => m.registerGateLetsThrough()),
  );
  registerFacetLoader('facet:modeCollapse', () =>
    import('@ffacet/algorithm-mode-collapse').then((m) => m.registerModeCollapse()),
  );
  registerFacetLoader('facet:nudgeTowardReward', () =>
    import('@ffacet/algorithm-nudge-toward-reward').then((m) => m.registerNudgeTowardReward()),
  );
  registerFacetLoader('facet:orderMustBeAdded', () =>
    import('@ffacet/algorithm-order-must-be-added').then((m) => m.registerOrderMustBeAdded()),
  );
  registerFacetLoader('facet:queryKeyValue', () =>
    import('@ffacet/algorithm-query-key-value').then((m) => m.registerQueryKeyValue()),
  );
  registerFacetLoader('facet:sameWeightsEachStep', () =>
    import('@ffacet/algorithm-same-weights-each-step').then((m) => m.registerSameWeightsEachStep()),
  );
  registerFacetLoader('facet:sampleAndDecode', () =>
    import('@ffacet/algorithm-sample-and-decode').then((m) => m.registerSampleAndDecode()),
  );
  registerFacetLoader('facet:severalViews', () =>
    import('@ffacet/algorithm-several-views').then((m) => m.registerSeveralViews()),
  );
  registerFacetLoader('facet:shrinkBySummary', () =>
    import('@ffacet/algorithm-shrink-by-summary').then((m) => m.registerShrinkBySummary()),
  );
  registerFacetLoader('facet:slideTheKernel', () =>
    import('@ffacet/algorithm-slide-the-kernel').then((m) => m.registerSlideTheKernel()),
  );
  registerFacetLoader('facet:stateActionReward', () =>
    import('@ffacet/algorithm-state-action-reward').then((m) => m.registerStateActionReward()),
  );
  registerFacetLoader('facet:strideAndPadding', () =>
    import('@ffacet/algorithm-stride-and-padding').then((m) => m.registerStrideAndPadding()),
  );
  registerFacetLoader('facet:twoNetsCompete', () =>
    import('@ffacet/algorithm-two-nets-compete').then((m) => m.registerTwoNetsCompete()),
  );
  registerFacetLoader('facet:unrollThenBackprop', () =>
    import('@ffacet/algorithm-unroll-then-backprop').then((m) => m.registerUnrollThenBackprop()),
  );
  registerFacetLoader('facet:valueOfAction', () =>
    import('@ffacet/algorithm-value-of-action').then((m) => m.registerValueOfAction()),
  );
  registerFacetLoader('facet:vanishingOverTime', () =>
    import('@ffacet/algorithm-vanishing-over-time').then((m) => m.registerVanishingOverTime()),
  );
  registerFacetLoader('facet:weightSharing', () =>
    import('@ffacet/algorithm-weight-sharing').then((m) => m.registerWeightSharing()),
  );
}
