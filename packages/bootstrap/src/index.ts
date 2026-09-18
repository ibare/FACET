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
}
