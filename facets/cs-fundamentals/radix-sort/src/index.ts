/**
 * @ffacet/algorithm-radix-sort — 기수 정렬 (LSD) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { radixSort, type RadixSortData } from './algorithm.js';
export { radixSortProjector } from './projector.js';
export { radixSortLsdIR, radixSortIRs } from './irs.js';
export { radixSortFacet } from './facet.js';
export { radixSortDescription } from './description.js';
export { radixSortStageView, type RadixCellState } from './radix-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { radixSort, type RadixSortData } from './algorithm.js';
import { radixSortProjector } from './projector.js';
import { radixSortIRs } from './irs.js';
import { radixSortStageView } from './radix-sort-stage.js';
import { radixSortFacet } from './facet.js';
import { radixSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerRadixSort(): void {
  registerAlgorithm<RadixSortData>('radixSort', radixSort);
  registerProjector('radixSortProjector', radixSortProjector);
  for (const ir of radixSortIRs) registerIR(ir.id, ir);
  registerView('radix-sort-stage', radixSortStageView);
  registerFacets([radixSortFacet]);
  registerDescription(radixSortFacet.id, radixSortDescription);
}
