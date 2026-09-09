/**
 * @ffacet/algorithm-counting-sort — 카운팅 정렬 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export {
  countingSort,
  computeCountingSortResult,
  type CountingSortData,
} from './algorithm.js';
export { countingSortProjector } from './projector.js';
export { countingSortStableIR, countingSortIRs } from './irs.js';
export { countingSortFacet } from './facet.js';
export { countingSortDescription } from './description.js';
export {
  countingSortStageView,
  type CountingSortInputState,
  type CountingSortStep,
} from './counting-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { countingSort, type CountingSortData } from './algorithm.js';
import { countingSortProjector } from './projector.js';
import { countingSortIRs } from './irs.js';
import { countingSortStageView } from './counting-sort-stage.js';
import { countingSortFacet } from './facet.js';
import { countingSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerCountingSort(): void {
  registerAlgorithm<CountingSortData>('countingSort', countingSort);
  registerProjector('countingSortProjector', countingSortProjector);
  for (const ir of countingSortIRs) registerIR(ir.id, ir);
  registerView('counting-sort-stage', countingSortStageView);
  registerFacets([countingSortFacet]);
  registerDescription(countingSortFacet.id, countingSortDescription);
}
