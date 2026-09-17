/**
 * all-suffixes-sorted 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트에 있다 (S-facet).
 *
 * 화면은 걸음마다의 장면에서 만들어지므로 (`scene.ts`) 어느 걸음으로 끌어도 같은
 * 그림이 선다. projector 는 없다 (S-scene).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { allSuffixesSortedAlgorithm, type AllSuffixesSortedData } from './algorithm.js';
import { allSuffixesSortedScene } from './scene.js';
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
  registerScenePlan('allSuffixesSortedScene', allSuffixesSortedScene);
  for (const ir of allSuffixesSortedIRs) registerIR(ir.id, ir);
  registerView('all-suffixes-sorted-stage', allSuffixesSortedStageView);
  registerFacets([allSuffixesSortedFacet]);
  registerDescription(allSuffixesSortedFacet.id, allSuffixesSortedDescription);
}

export {
  allSuffixesSortedAlgorithm,
  buildTails,
  sortTails,
  largestSharedHeadRun,
  computeAllSuffixesSortedResult,
  type AllSuffixesSortedData,
  type Tail,
} from './algorithm.js';
export {
  allSuffixesSortedScene,
  placedTails,
  type AllSuffixesSortedScene,
  type AllSuffixesSortedCluster,
  type AllSuffixesSortedStep,
  type AllSuffixesSortedCaption,
} from './scene.js';
export { allSuffixesSortedIRs } from './irs.js';
export { allSuffixesSortedStageView } from './all-suffixes-sorted-stage.js';
export { allSuffixesSortedFacet } from './facet.js';
export { allSuffixesSortedDescription } from './description.js';
