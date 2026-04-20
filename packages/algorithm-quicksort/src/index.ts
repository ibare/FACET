/**
 * @facet/algorithm-quicksort — 4-layer 구조의 첫 실 알고리즘 모듈.
 */

export { quicksort, type QuickSortData } from './algorithm.js';
export { quicksortProjector } from './projector.js';
export { quicksortIRs } from './irs.js';
export {
  quicksortTranspilers,
  quicksortPythonImperative,
  quicksortPythonFunctional,
  quicksortJavascriptImperative,
} from './transpilers.js';
export { quicksortFacet } from './facet.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerTranspiler,
} from '@facet/core/runtime';
import { quicksort } from './algorithm.js';
import { quicksortProjector } from './projector.js';
import { quicksortIRs } from './irs.js';
import { quicksortTranspilers } from './transpilers.js';
import { quicksortFacet } from './facet.js';

/** 한 번에 모두 등록하는 헬퍼 */
export function registerQuicksort(): void {
  registerAlgorithm('quicksort', quicksort);
  registerProjector('quicksortProjector', quicksortProjector);
  for (const ir of quicksortIRs) registerIR(ir.id, ir);
  for (const t of quicksortTranspilers) registerTranspiler(t.id, t);
  registerFacets([quicksortFacet]);
}
