/**
 * @ffacet/algorithm-insertion-sort — 삽입 정렬 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { insertionSort, type InsertionSortData } from './algorithm.js';
export { insertionSortProjector } from './projector.js';
export { insertionSortImperativeIR, insertionSortIRs } from './irs.js';
export { insertionSortFacet } from './facet.js';
export { insertionSortDescription } from './description.js';
export {
  insertionSortStageView,
  type InsertionSortStageInstance,
} from './insertion-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { insertionSort, type InsertionSortData } from './algorithm.js';
import { insertionSortProjector } from './projector.js';
import { insertionSortIRs } from './irs.js';
import { insertionSortStageView } from './insertion-sort-stage.js';
import { insertionSortFacet } from './facet.js';
import { insertionSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerInsertionSort(): void {
  registerAlgorithm<InsertionSortData>('insertionSort', insertionSort);
  registerProjector('insertionSortProjector', insertionSortProjector);
  for (const ir of insertionSortIRs) registerIR(ir.id, ir);
  registerView('insertion-sort-stage', insertionSortStageView);
  registerFacets([insertionSortFacet]);
  registerDescription(insertionSortFacet.id, insertionSortDescription);
}
