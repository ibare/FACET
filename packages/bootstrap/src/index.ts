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
  registerFacetLoader('facet:quickSort', () =>
    import('@facet/algorithm-quicksort').then((m) => m.registerQuicksort()),
  );
  registerFacetLoader('facet:selectionSort', () =>
    import('@facet/algorithm-selectionsort').then((m) => m.registerSelectionsort()),
  );
  registerFacetLoader('facet:insertionSort', () =>
    import('@facet/algorithm-insertionsort').then((m) => m.registerInsertionsort()),
  );
  registerFacetLoader('facet:mergeSort', () =>
    import('@facet/algorithm-mergesort').then((m) => m.registerMergesort()),
  );
  registerFacetLoader('facet:heapSort', () =>
    import('@facet/algorithm-heapsort').then((m) => m.registerHeapsort()),
  );
  registerFacetLoader('facet:countingSort', () =>
    import('@facet/algorithm-countingsort').then((m) => m.registerCountingsort()),
  );
  registerFacetLoader('facet:radixSort', () =>
    import('@facet/algorithm-radixsort').then((m) => m.registerRadixsort()),
  );
  registerFacetLoader('facet:shellSort', () =>
    import('@facet/algorithm-shellsort').then((m) => m.registerShellsort()),
  );
  registerFacetLoader('facet:linearSearch', () =>
    import('@facet/algorithm-linearsearch').then((m) => m.registerLinearsearch()),
  );
  registerFacetLoader('facet:binarySearch', () =>
    import('@facet/algorithm-binarysearch').then((m) => m.registerBinarysearch()),
  );
  registerFacetLoader('facet:interpolationSearch', () =>
    import('@facet/algorithm-interpolationsearch').then((m) => m.registerInterpolationsearch()),
  );
  registerFacetLoader('facet:factorial', () =>
    import('@facet/algorithm-factorial').then((m) => m.registerFactorial()),
  );
  registerFacetLoader('facet:arrayMax', () =>
    import('@facet/algorithm-arraymax').then((m) => m.registerArraymax()),
  );
  registerFacetLoader('facet:fibonacciMemo', () =>
    import('@facet/algorithm-fibonaccimemo').then((m) => m.registerFibonaccimemo()),
  );
  registerFacetLoader('facet:coinChange', () =>
    import('@facet/algorithm-coinchange').then((m) => m.registerCoinchange()),
  );
  registerFacetLoader('facet:subsetSum', () =>
    import('@facet/algorithm-subsetsum').then((m) => m.registerSubsetsum()),
  );
  registerFacetLoader('facet:knapsack', () =>
    import('@facet/algorithm-knapsack').then((m) => m.registerKnapsack()),
  );
  registerFacetLoader('facet:bfs', () =>
    import('@facet/algorithm-bfs').then((m) => m.registerBfs()),
  );
  registerFacetLoader('facet:queue', () =>
    import('@facet/algorithm-queue').then((m) => m.registerQueue()),
  );
  registerFacetLoader('facet:bst', () =>
    import('@facet/algorithm-bst').then((m) => m.registerBst()),
  );
}
