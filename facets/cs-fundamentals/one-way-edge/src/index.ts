/**
 * @ffacet/algorithm-one-way-edge — 방향 간선 조각(piece).
 *
 * algorithm / 장면 설계 / stage view / facet JSON 을 한데 묶고
 * 등록 헬퍼를 낸다. 등록 호출은 호스트 앱의 몫이다 (부수효과로 부르지 않는다).
 */

export {
  oneWayEdgeAlgorithm,
  directedEnds,
  type OneWayEdgeData,
  type OneWayEdgeLine,
} from './algorithm.js';
export {
  oneWayEdgeScene,
  blockedNeighborsOf,
  keptLane,
  strandedOf,
  type OneWayEdgeBlock,
  type OneWayEdgeCaption,
  type OneWayEdgeMode,
  type OneWayEdgeScene,
  type OneWayEdgeStep,
} from './scene.js';
export { oneWayEdgeStageView } from './one-way-edge-stage.js';
export { oneWayEdgeIRs } from './irs.js';
export { oneWayEdgeFacet } from './facet.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { oneWayEdgeAlgorithm, type OneWayEdgeData } from './algorithm.js';
import { oneWayEdgeScene } from './scene.js';
import { oneWayEdgeStageView } from './one-way-edge-stage.js';
import { oneWayEdgeIRs } from './irs.js';
import { oneWayEdgeFacet } from './facet.js';

/** algorithm / 장면 설계 / IR / stage view / facet 등록 헬퍼. */
export function registerOneWayEdge(): void {
  registerAlgorithm<OneWayEdgeData>('oneWayEdge', oneWayEdgeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('oneWayEdgeScene', oneWayEdgeScene);
  for (const ir of oneWayEdgeIRs) registerIR(ir.id, ir);
  registerView('one-way-edge-stage', oneWayEdgeStageView);
  registerFacets([oneWayEdgeFacet]);
}
