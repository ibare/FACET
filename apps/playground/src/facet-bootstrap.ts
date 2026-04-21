/**
 * Playground 부트스트랩.
 *
 * 정적 등록(즉시 필요한 것):
 *  - View Catalog (built-in + code-view)
 *  - Transpiler 6종 (code-view 가 paradigm 호환 transpiler 목록을 보여주려면 모두 등록 필요)
 *
 * 동적 등록(lazy):
 *  - algorithm 패키지(@facet/algorithm-*) 는 registerFacetLoader 로만 매핑.
 *    NodeView/페이지가 facet 마운트 시점에 동적 import 하면 Vite 가 별도 chunk 로 분리.
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

  // facet → 동적 import. 동일 chunk 안에 algorithm/projector/IR/facet/description 이 함께 묶임.
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
}
