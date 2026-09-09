/**
 * @ffacet/algorithm-selection-sort — 선택 정렬 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export {
  selectionSort,
  computeSelectionSortResult,
  type SelectionSortData,
} from './algorithm.js';
export { selectionSortProjector } from './projector.js';
export { selectionSortImperativeIR, selectionSortIRs } from './irs.js';
export { selectionSortFacet } from './facet.js';
export { selectionSortDescription } from './description.js';
export { selectionSortStageView } from './selection-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { selectionSort, type SelectionSortData } from './algorithm.js';
import { selectionSortProjector } from './projector.js';
import { selectionSortIRs } from './irs.js';
import { selectionSortStageView } from './selection-sort-stage.js';
import { selectionSortFacet } from './facet.js';
import { selectionSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerSelectionSort(): void {
  registerAlgorithm<SelectionSortData>('selectionSort', selectionSort);
  registerProjector('selectionSortProjector', selectionSortProjector);
  for (const ir of selectionSortIRs) registerIR(ir.id, ir);
  registerView('selection-sort-stage', selectionSortStageView);
  registerFacets([selectionSortFacet]);
  registerDescription(selectionSortFacet.id, selectionSortDescription);
}
