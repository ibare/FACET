/**
 * @facet/algorithm-bubblesort — 4-layer 두 번째 알고리즘 모듈.
 *
 * QuickSort 와 같은 bar-chart View 를 재사용하며, Projector/IR/Transpiler/JSON 만 새로 선언.
 */

export { bubblesort, type BubbleSortData } from './algorithm.js';
export { bubblesortProjector } from './projector.js';
export { bubblesortIRs } from './irs.js';
export {
  bubblesortTranspilers,
  bubblesortPythonImperative,
  bubblesortJavascriptImperative,
} from './transpilers.js';
export { bubblesortFacet } from './facet.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerTranspiler,
} from '@facet/core/runtime';
import { bubblesort } from './algorithm.js';
import { bubblesortProjector } from './projector.js';
import { bubblesortIRs } from './irs.js';
import { bubblesortTranspilers } from './transpilers.js';
import { bubblesortFacet } from './facet.js';

/** 한 번에 모두 등록하는 헬퍼 */
export function registerBubblesort(): void {
  registerAlgorithm('bubblesort', bubblesort);
  registerProjector('bubblesortProjector', bubblesortProjector);
  for (const ir of bubblesortIRs) registerIR(ir.id, ir);
  for (const t of bubblesortTranspilers) registerTranspiler(t.id, t);
  registerFacets([bubblesortFacet]);
}
