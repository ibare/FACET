/**
 * @ffacet/algorithm-linear-search — 선형 탐색 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { linearSearch, type LinearSearchData } from './algorithm.js';
export { linearSearchProjector } from './projector.js';
export { linearSearchScanIR, linearSearchIRs } from './irs.js';
export { linearSearchFacet } from './facet.js';
export { linearSearchDescription } from './description.js';
export {
  linearSearchStageView,
  type LinearSearchCellState,
  type LinearSearchRecord,
} from './linear-search-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { linearSearch, type LinearSearchData } from './algorithm.js';
import { linearSearchProjector } from './projector.js';
import { linearSearchIRs } from './irs.js';
import { linearSearchStageView } from './linear-search-stage.js';
import { linearSearchFacet } from './facet.js';
import { linearSearchDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerLinearSearch(): void {
  registerAlgorithm<LinearSearchData>('linearSearch', linearSearch);
  registerProjector('linearSearchProjector', linearSearchProjector);
  for (const ir of linearSearchIRs) registerIR(ir.id, ir);
  registerView('linear-search-stage', linearSearchStageView);
  registerFacets([linearSearchFacet]);
  registerDescription(linearSearchFacet.id, linearSearchDescription);
}
