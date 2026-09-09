/**
 * @ffacet/algorithm-quick-sort — 퀵 정렬 (Lomuto) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { quickSort, type QuickSortData } from './algorithm.js';
export { quickSortProjector } from './projector.js';
export { quickSortLomutoIR, quickSortIRs } from './irs.js';
export { quickSortFacet } from './facet.js';
export { quickSortDescription } from './description.js';
export { quickSortStageView, type QuickSortCellState } from './quick-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { quickSort, type QuickSortData } from './algorithm.js';
import { quickSortProjector } from './projector.js';
import { quickSortIRs } from './irs.js';
import { quickSortStageView } from './quick-sort-stage.js';
import { quickSortFacet } from './facet.js';
import { quickSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerQuickSort(): void {
  registerAlgorithm<QuickSortData>('quickSort', quickSort);
  registerProjector('quickSortProjector', quickSortProjector);
  for (const ir of quickSortIRs) registerIR(ir.id, ir);
  registerView('quick-sort-stage', quickSortStageView);
  registerFacets([quickSortFacet]);
  registerDescription(quickSortFacet.id, quickSortDescription);
}
