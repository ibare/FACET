/**
 * requiresSorted 조각 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 *
 * 화면은 장면(Scene) 방식이라 어느 걸음이든 셈으로 얻는다 — 띠를 끌어 되짚어도
 * 같은 화면이 선다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { requiresSortedAlgorithm, type RequiresSortedData } from './algorithm.js';
import { requiresSortedScene } from './scene.js';
import { requiresSortedIRs } from './irs.js';
import { requiresSortedFacet } from './facet.js';
import { requiresSortedStageView } from './requires-sorted-stage.js';

export {
  requiresSortedAlgorithm,
  requiresSortedScene,
  requiresSortedIRs,
  requiresSortedFacet,
  requiresSortedStageView,
};
export type { RequiresSortedData, RequiresSortedRow } from './algorithm.js';
export type { RequiresSortedScene } from './scene.js';

export function registerRequiresSorted(): void {
  // 조각은 mount 즉시 스스로 돌고 걸음 간격을 스스로 정한다 → reactive (S-piece).
  registerAlgorithm<RequiresSortedData>('requiresSorted', requiresSortedAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('requiresSortedScene', requiresSortedScene);
  for (const ir of requiresSortedIRs) registerIR(ir.id, ir);
  registerView('requires-sorted-stage', requiresSortedStageView);
  registerFacets([requiresSortedFacet]);
}
