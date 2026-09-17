/**
 * sortEdgesAvoidCycle 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 호출하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 *
 * 화면은 명령이 아니라 **장면**에서 만들어진다 (`scene.ts`) — projector 대신
 * ScenePlan 을 등록한다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { sortEdgesAvoidCycleAlgorithm, type SortEdgesAvoidCycleData } from './algorithm.js';
import { sortEdgesAvoidCycleFacet } from './facet.js';
import { sortEdgesAvoidCycleIRs } from './irs.js';
import { sortEdgesAvoidCycleScene } from './scene.js';
import { sortEdgesAvoidCycleStageView } from './sort-edges-avoid-cycle-stage.js';

export {
  sortEdgesAvoidCycleAlgorithm,
  sortEdgesAvoidCycleFacet,
  sortEdgesAvoidCycleIRs,
  sortEdgesAvoidCycleScene,
  sortEdgesAvoidCycleStageView,
};
export type { SortEdgesAvoidCycleData, SortEdgesAvoidCycleEdge } from './algorithm.js';
export type { SortEdgesAvoidCycleScene, SortEdgesEdge } from './scene.js';

export function registerSortEdgesAvoidCycle(): void {
  registerAlgorithm<SortEdgesAvoidCycleData>(
    'sortEdgesAvoidCycle',
    sortEdgesAvoidCycleAlgorithm,
    // 조각은 스스로 시작하고 걸음 간격을 스스로 정해야 하므로 reactive 다 (S-piece).
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('sortEdgesAvoidCycleScene', sortEdgesAvoidCycleScene);
  for (const ir of sortEdgesAvoidCycleIRs) registerIR(ir.id, ir);
  registerView('sort-edges-avoid-cycle-stage', sortEdgesAvoidCycleStageView);
  registerFacets([sortEdgesAvoidCycleFacet]);
}
