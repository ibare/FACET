/**
 * @ffacet/algorithm-sort-stability — 정렬 안정성 조각 (piece).
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 register 를 부르지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

export {
  sortStability,
  stableResultOrder,
  selectionResultOrder,
  type SortStabilityData,
  type SortStabilityItem,
} from './algorithm.js';
export {
  sortStabilityScene,
  type SortStabilityScene,
  type SortStabilityCaption,
  type SortStabilityStep,
  type SortStabilityRow,
} from './scene.js';
export { sortStabilityIRs } from './irs.js';
export { sortStabilityFacet } from './facet.js';
export { sortStabilityStageView } from './sort-stability-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { sortStability, type SortStabilityData } from './algorithm.js';
import { sortStabilityScene } from './scene.js';
import { sortStabilityIRs } from './irs.js';
import { sortStabilityStageView } from './sort-stability-stage.js';
import { sortStabilityFacet } from './facet.js';

/** algorithm/장면/IR/view/facet 등록 헬퍼. */
export function registerSortStability(): void {
  registerAlgorithm<SortStabilityData>('sortStability', sortStability, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sortStabilityScene', sortStabilityScene);
  for (const ir of sortStabilityIRs) registerIR(ir.id, ir);
  registerView('sort-stability-stage', sortStabilityStageView);
  registerFacets([sortStabilityFacet]);
}
