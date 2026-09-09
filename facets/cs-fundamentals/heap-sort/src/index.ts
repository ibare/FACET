/**
 * @ffacet/algorithm-heap-sort — 힙 정렬 (제자리) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { heapSort, type HeapSortData } from './algorithm.js';
export { heapSortProjector } from './projector.js';
export { heapSortInPlaceIR, heapSortIRs } from './irs.js';
export { heapSortFacet } from './facet.js';
export { heapSortDescription } from './description.js';
export { heapSortStageView, type HeapSortCellState } from './heap-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { heapSort, type HeapSortData } from './algorithm.js';
import { heapSortProjector } from './projector.js';
import { heapSortIRs } from './irs.js';
import { heapSortStageView } from './heap-sort-stage.js';
import { heapSortFacet } from './facet.js';
import { heapSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerHeapSort(): void {
  registerAlgorithm<HeapSortData>('heapSort', heapSort);
  registerProjector('heapSortProjector', heapSortProjector);
  for (const ir of heapSortIRs) registerIR(ir.id, ir);
  registerView('heap-sort-stage', heapSortStageView);
  registerFacets([heapSortFacet]);
  registerDescription(heapSortFacet.id, heapSortDescription);
}
