/**
 * @ffacet/algorithm-merge-two-sorted — 병합 조각 번들.
 *
 * 정렬된 두 줄의 맨 앞만 견주고 이긴 쪽이 아래 결과줄로 내려간다. algorithm /
 * 장면 설계 / IR(빈 배열) / facet JSON / stage view 을 함께 묶고
 * 등록 헬퍼를 제공한다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 *
 * `registerMergeTwoSorted()` 는 import 부수효과로 불리지 않는다 — 호출 책임은
 * 호스트 앱에 있다 (S-facet).
 */

export { mergeTwoSortedAlgorithm, type MergeTwoSortedData } from './algorithm.js';
export { mergeTwoSortedScene, headsOf, type MergeTwoSortedScene } from './scene.js';
export { mergeTwoSortedIRs } from './irs.js';
export { mergeTwoSortedFacet } from './facet.js';
export { mergeTwoSortedStageView } from './merge-two-sorted-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { mergeTwoSortedAlgorithm, type MergeTwoSortedData } from './algorithm.js';
import { mergeTwoSortedScene } from './scene.js';
import { mergeTwoSortedIRs } from './irs.js';
import { mergeTwoSortedFacet } from './facet.js';
import { mergeTwoSortedStageView } from './merge-two-sorted-stage.js';

/** algorithm / 장면 설계 / IR / view / facet 등록 헬퍼. */
export function registerMergeTwoSorted(): void {
  registerAlgorithm<MergeTwoSortedData>('mergeTwoSorted', mergeTwoSortedAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('mergeTwoSortedScene', mergeTwoSortedScene);
  for (const ir of mergeTwoSortedIRs) registerIR(ir.id, ir);
  registerView('merge-two-sorted-stage', mergeTwoSortedStageView);
  registerFacets([mergeTwoSortedFacet]);
}
