/**
 * @ffacet/algorithm-one-way-edge — 방향 간선 조각(piece).
 *
 * algorithm / projector / stage view / facet JSON / description 을 한데 묶고
 * 등록 헬퍼를 낸다. 등록 호출은 호스트 앱의 몫이다 (부수효과로 부르지 않는다).
 */

export { oneWayEdgeAlgorithm, type OneWayEdgeData, type OneWayEdgeLine } from './algorithm.js';
export { oneWayEdgeProjector } from './projector.js';
export { oneWayEdgeStageView } from './one-way-edge-stage.js';
export { oneWayEdgeIRs } from './irs.js';
export { oneWayEdgeFacet } from './facet.js';
export { oneWayEdgeDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { oneWayEdgeAlgorithm, type OneWayEdgeData } from './algorithm.js';
import { oneWayEdgeProjector } from './projector.js';
import { oneWayEdgeStageView } from './one-way-edge-stage.js';
import { oneWayEdgeIRs } from './irs.js';
import { oneWayEdgeFacet } from './facet.js';
import { oneWayEdgeDescription } from './description.js';

/** algorithm / projector / IR / stage view / facet / description 등록 헬퍼. */
export function registerOneWayEdge(): void {
  registerAlgorithm<OneWayEdgeData>('oneWayEdge', oneWayEdgeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('oneWayEdgeProjector', oneWayEdgeProjector);
  for (const ir of oneWayEdgeIRs) registerIR(ir.id, ir);
  registerView('one-way-edge-stage', oneWayEdgeStageView);
  registerFacets([oneWayEdgeFacet]);
  registerDescription(oneWayEdgeFacet.id, oneWayEdgeDescription);
}
