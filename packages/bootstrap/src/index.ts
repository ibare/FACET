/**
 * @facet/bootstrap — facet 카탈로그 단일 출처.
 *
 * 정적 등록 (즉시 필요):
 *  - View Catalog (built-in + code-view)
 *  - Transpiler 6종
 *
 * 동적 등록 (lazy):
 *  - algorithm 패키지(@facet/algorithm-*) 는 registerFacetLoader 로만 매핑.
 *    각 import() 가 번들러의 dynamic import 경계로 인식되어 facet 별 chunk 로 분리된다.
 *  - 현재 등록 facet 10종: bubbleSort (모범 사례) + 자료구조 array / stack / queue / linkedList / hashTable / bst /
 *    lruCache + 그래프 bfs + 시스템 행동 messagingPubsub.
 *    그 외 cs-fundamentals/algorithms 토픽들은 카탈로그에 슬롯만 남고 facetId 미지정.
 *
 * 소비자:
 *  - apps/playground (dev/build) — main.tsx 에서 bootstrapFacet() 호출
 *  - @facet/host-tiptap-bundle (외부 호스트 tarball) — re-export
 */

import {
  registerBuiltinViews,
  registerFacetLoader,
} from '@facet/core/runtime';
import { registerCodeView } from '@facet/view-code';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerJavascriptTranspiler } from '@facet/transpiler-javascript';
import { registerTypescriptTranspiler } from '@facet/transpiler-typescript';
import { registerJavaTranspiler } from '@facet/transpiler-java';
import { registerCppTranspiler } from '@facet/transpiler-cpp';
import { registerCsharpTranspiler } from '@facet/transpiler-csharp';

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
    import('@facet/algorithm-bubblesort').then((m) => m.registerBubblesort()),
  );
  registerFacetLoader('facet:bfs', () =>
    import('@facet/algorithm-bfs').then((m) => m.registerBfs()),
  );
  registerFacetLoader('facet:queue', () =>
    import('@facet/algorithm-queue').then((m) => m.registerQueue()),
  );
  registerFacetLoader('facet:stack', () =>
    import('@facet/algorithm-stack').then((m) => m.registerStack()),
  );
  registerFacetLoader('facet:array', () =>
    import('@facet/algorithm-array').then((m) => m.registerArray()),
  );
  registerFacetLoader('facet:linkedList', () =>
    import('@facet/algorithm-linked-list').then((m) => m.registerLinkedList()),
  );
  registerFacetLoader('facet:hashTable', () =>
    import('@facet/algorithm-hash-table').then((m) => m.registerHashTable()),
  );
  registerFacetLoader('facet:bst', () =>
    import('@facet/algorithm-bst').then((m) => m.registerBst()),
  );
  registerFacetLoader('facet:lruCache', () =>
    import('@facet/algorithm-lru-cache').then((m) => m.registerLruCache()),
  );
  registerFacetLoader('facet:messagingPubsub', () =>
    import('@facet/algorithm-messaging-pubsub').then((m) => m.registerMessagingPubsub()),
  );
}
