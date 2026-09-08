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
 *  - getFacetCatalog() — facet 모듈을 로드하지 않고 추가 가능 목록(id/title/description/domain)
 *    을 동기 조회. 빌드타임 codegen 산출(facet-catalog.generated.ts)을 그대로 노출.
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
export type { FacetCatalogEntry } from './catalog-types.js';

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
}
