/**
 * Playground 시작 시 4-layer 러너용 모듈/IR/Transpiler/JSON 을 일괄 등록.
 */

import { registerBuiltinViews, listFacets } from '@facet/core/runtime';
import { registerQuicksort } from '@facet/algorithm-quicksort';
import { registerBubblesort } from '@facet/algorithm-bubblesort';

let initialized = false;

export function bootstrapFacet(): void {
  if (initialized) return;
  initialized = true;

  registerBuiltinViews();
  registerQuicksort();
  registerBubblesort();

  const ids = listFacets();
  if (ids.length === 0) {
    console.warn('[facet] no facets registered');
  } else {
    console.info('[facet] facets:', ids);
  }
}
