/**
 * Playground 시작 시 4-layer 러너용 모듈/IR/Transpiler/JSON 을 일괄 등록.
 *
 * Transpiler 는 언어별 패키지로 분리되어 있어 호스트(playground)가 등록 책임을 진다.
 */

import { registerBuiltinViews, listFacets } from '@facet/core/runtime';
import { registerCodeView } from '@facet/view-code';
import { registerQuicksort } from '@facet/algorithm-quicksort';
import { registerBubblesort } from '@facet/algorithm-bubblesort';
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

  registerQuicksort();
  registerBubblesort();

  const ids = listFacets();
  if (ids.length === 0) {
    console.warn('[facet] no facets registered');
  } else {
    console.info('[facet] facets:', ids);
  }
}
