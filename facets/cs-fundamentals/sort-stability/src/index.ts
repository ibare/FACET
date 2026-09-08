/**
 * @ffacet/algorithm-sort-stability — 정렬 안정성 조각 (piece).
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 register 를 부르지 않는다.
 */

export {
  sortStability,
  stableResultOrder,
  selectionResultOrder,
  type SortStabilityData,
  type SortStabilityItem,
} from './algorithm.js';
export { sortStabilityProjector } from './projector.js';
export { sortStabilityIRs } from './irs.js';
export { sortStabilityFacet } from './facet.js';
export { sortStabilityDescription } from './description.js';
export { sortStabilityStageView } from './sort-stability-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { sortStability, type SortStabilityData } from './algorithm.js';
import { sortStabilityProjector } from './projector.js';
import { sortStabilityIRs } from './irs.js';
import { sortStabilityStageView } from './sort-stability-stage.js';
import { sortStabilityFacet } from './facet.js';
import { sortStabilityDescription } from './description.js';

/** algorithm/projector/IR/view/facet/description 등록 헬퍼. */
export function registerSortStability(): void {
  registerAlgorithm<SortStabilityData>('sortStability', sortStability, {
    mechanismKind: 'reactive',
  });
  registerProjector('sortStabilityProjector', sortStabilityProjector);
  for (const ir of sortStabilityIRs) registerIR(ir.id, ir);
  registerView('sort-stability-stage', sortStabilityStageView);
  registerFacets([sortStabilityFacet]);
  registerDescription(sortStabilityFacet.id, sortStabilityDescription);
}
