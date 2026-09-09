/**
 * @ffacet/algorithm-binary-search — 이진 탐색 (반복형) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { binarySearch, type BinarySearchData } from './algorithm.js';
export { binarySearchProjector } from './projector.js';
export { binarySearchIterativeIR, binarySearchIRs } from './irs.js';
export { binarySearchFacet } from './facet.js';
export { binarySearchDescription } from './description.js';
export {
  binarySearchStageView,
  type BinarySearchStepRow,
  type BinarySearchRunState,
} from './binary-search-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { binarySearch, type BinarySearchData } from './algorithm.js';
import { binarySearchProjector } from './projector.js';
import { binarySearchIRs } from './irs.js';
import { binarySearchStageView } from './binary-search-stage.js';
import { binarySearchFacet } from './facet.js';
import { binarySearchDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerBinarySearch(): void {
  registerAlgorithm<BinarySearchData>('binarySearch', binarySearch);
  registerProjector('binarySearchProjector', binarySearchProjector);
  for (const ir of binarySearchIRs) registerIR(ir.id, ir);
  registerView('binary-search-stage', binarySearchStageView);
  registerFacets([binarySearchFacet]);
  registerDescription(binarySearchFacet.id, binarySearchDescription);
}
