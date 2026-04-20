/**
 * @facet/algorithm-quicksort — 4-layer 알고리즘 모듈.
 *
 * 코드 패널 라인은 IR + 언어별 transpiler (별도 패키지) 로 생성되므로
 * 이 패키지는 transpiler 를 등록하지 않는다.
 */

export { quicksort, type QuickSortData } from './algorithm.js';
export { quicksortProjector } from './projector.js';
export { quicksortImperativeIR, quicksortIRs } from './irs.js';
export { quicksortFacet } from './facet.js';
export { quicksortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { quicksort } from './algorithm.js';
import { quicksortProjector } from './projector.js';
import { quicksortIRs } from './irs.js';
import { quicksortFacet } from './facet.js';
import { quicksortDescription } from './description.js';

/** algorithm/projector/IR/facet/description 등록 헬퍼 (transpiler 는 호스트가 별도 등록). */
export function registerQuicksort(): void {
  registerAlgorithm('quicksort', quicksort);
  registerProjector('quicksortProjector', quicksortProjector);
  for (const ir of quicksortIRs) registerIR(ir.id, ir);
  registerFacets([quicksortFacet]);
  registerDescription(quicksortFacet.id, quicksortDescription);
}
