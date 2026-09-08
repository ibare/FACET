/**
 * @ffacet/algorithm-merge-two-sorted — 병합 조각 번들.
 *
 * 정렬된 두 줄의 맨 앞만 견주고 이긴 쪽이 아래 결과줄로 내려간다. algorithm /
 * projector / IR(빈 배열) / facet JSON / stage view / description 을 함께 묶고
 * 등록 헬퍼를 제공한다.
 *
 * `registerMergeTwoSorted()` 는 import 부수효과로 불리지 않는다 — 호출 책임은
 * 호스트 앱에 있다 (S-facet).
 */

export { mergeTwoSortedAlgorithm, type MergeTwoSortedData } from './algorithm.js';
export { mergeTwoSortedProjector } from './projector.js';
export { mergeTwoSortedIRs } from './irs.js';
export { mergeTwoSortedFacet } from './facet.js';
export { mergeTwoSortedStageView } from './merge-two-sorted-stage.js';
export { mergeTwoSortedDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { mergeTwoSortedAlgorithm, type MergeTwoSortedData } from './algorithm.js';
import { mergeTwoSortedProjector } from './projector.js';
import { mergeTwoSortedIRs } from './irs.js';
import { mergeTwoSortedFacet } from './facet.js';
import { mergeTwoSortedStageView } from './merge-two-sorted-stage.js';
import { mergeTwoSortedDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerMergeTwoSorted(): void {
  registerAlgorithm<MergeTwoSortedData>('mergeTwoSorted', mergeTwoSortedAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('mergeTwoSortedProjector', mergeTwoSortedProjector);
  for (const ir of mergeTwoSortedIRs) registerIR(ir.id, ir);
  registerView('merge-two-sorted-stage', mergeTwoSortedStageView);
  registerFacets([mergeTwoSortedFacet]);
  registerDescription(mergeTwoSortedFacet.id, mergeTwoSortedDescription);
}
