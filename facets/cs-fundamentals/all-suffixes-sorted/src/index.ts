/**
 * all-suffixes-sorted 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { allSuffixesSortedAlgorithm, type AllSuffixesSortedData } from './algorithm.js';
import { allSuffixesSortedProjector } from './projector.js';
import { allSuffixesSortedIRs } from './irs.js';
import { allSuffixesSortedStageView } from './all-suffixes-sorted-stage.js';
import { allSuffixesSortedFacet } from './facet.js';
import { allSuffixesSortedDescription } from './description.js';

export function registerAllSuffixesSorted(): void {
  registerAlgorithm<AllSuffixesSortedData>(
    'allSuffixesSorted',
    allSuffixesSortedAlgorithm,
    // 조각은 스스로 시작하고 스스로 걸음 간격을 정한다 — 둘 다 reactive 만 준다.
    { mechanismKind: 'reactive' },
  );
  registerProjector('allSuffixesSortedProjector', allSuffixesSortedProjector);
  for (const ir of allSuffixesSortedIRs) registerIR(ir.id, ir);
  registerView('all-suffixes-sorted-stage', allSuffixesSortedStageView);
  registerFacets([allSuffixesSortedFacet]);
  registerDescription(allSuffixesSortedFacet.id, allSuffixesSortedDescription);
}

export {
  allSuffixesSortedAlgorithm,
  buildTails,
  sortTails,
  computeAllSuffixesSortedResult,
  type AllSuffixesSortedData,
  type Tail,
} from './algorithm.js';
export { allSuffixesSortedProjector } from './projector.js';
export { allSuffixesSortedIRs } from './irs.js';
export {
  allSuffixesSortedStageView,
  readAllSuffixesSortedScene,
  type AllSuffixesSortedScene,
} from './all-suffixes-sorted-stage.js';
export { allSuffixesSortedFacet } from './facet.js';
export { allSuffixesSortedDescription } from './description.js';
