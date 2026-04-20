/**
 * @facet/algorithm-bubblesort — 4-layer 알고리즘 모듈.
 *
 * QuickSort 와 같은 bar-chart View 를 재사용. 코드 라인은 IR + 언어별 transpiler
 * (별도 패키지) 로 생성되므로 이 패키지는 transpiler 를 등록하지 않는다.
 */

export { bubblesort, type BubbleSortData } from './algorithm.js';
export { bubblesortProjector } from './projector.js';
export { bubblesortImperativeIR, bubblesortIRs } from './irs.js';
export { bubblesortFacet } from './facet.js';
export { bubblesortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { bubblesort } from './algorithm.js';
import { bubblesortProjector } from './projector.js';
import { bubblesortIRs } from './irs.js';
import { bubblesortFacet } from './facet.js';
import { bubblesortDescription } from './description.js';

/** algorithm/projector/IR/facet/description 등록 헬퍼 (transpiler 는 호스트가 별도 등록). */
export function registerBubblesort(): void {
  registerAlgorithm('bubblesort', bubblesort);
  registerProjector('bubblesortProjector', bubblesortProjector);
  for (const ir of bubblesortIRs) registerIR(ir.id, ir);
  registerFacets([bubblesortFacet]);
  registerDescription(bubblesortFacet.id, bubblesortDescription);
}
