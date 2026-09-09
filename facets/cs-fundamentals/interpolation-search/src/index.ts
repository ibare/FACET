/**
 * @ffacet/algorithm-interpolation-search — 보간 탐색 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { interpolationSearch, type InterpolationSearchData } from './algorithm.js';
export { interpolationSearchProjector } from './projector.js';
export { interpolationSearchProbeIR, interpolationSearchIRs } from './irs.js';
export { interpolationSearchFacet } from './facet.js';
export { interpolationSearchDescription } from './description.js';
export {
  interpolationSearchStageView,
  type InterpolationCellState,
  type InterpolationProbeFormula,
  type InterpolationTrackMark,
} from './interpolation-search-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { interpolationSearch, type InterpolationSearchData } from './algorithm.js';
import { interpolationSearchProjector } from './projector.js';
import { interpolationSearchIRs } from './irs.js';
import { interpolationSearchStageView } from './interpolation-search-stage.js';
import { interpolationSearchFacet } from './facet.js';
import { interpolationSearchDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerInterpolationSearch(): void {
  registerAlgorithm<InterpolationSearchData>('interpolationSearch', interpolationSearch);
  registerProjector('interpolationSearchProjector', interpolationSearchProjector);
  for (const ir of interpolationSearchIRs) registerIR(ir.id, ir);
  registerView('interpolation-search-stage', interpolationSearchStageView);
  registerFacets([interpolationSearchFacet]);
  registerDescription(interpolationSearchFacet.id, interpolationSearchDescription);
}
