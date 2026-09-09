/**
 * @ffacet/algorithm-max-flow — 최대 유량 (에드몬즈-카프) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export {
  maxFlowAlgorithm,
  buildCapacityMatrix,
  type MaxFlowData,
  type MaxFlowEdge,
} from './algorithm.js';
export { maxFlowProjector } from './projector.js';
export { maxFlowEdmondsKarpIR, maxFlowIRs } from './irs.js';
export { maxFlowFacet } from './facet.js';
export { maxFlowDescription } from './description.js';
export { maxFlowStageView } from './max-flow-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { maxFlowAlgorithm, type MaxFlowData } from './algorithm.js';
import { maxFlowProjector } from './projector.js';
import { maxFlowIRs } from './irs.js';
import { maxFlowStageView } from './max-flow-stage.js';
import { maxFlowFacet } from './facet.js';
import { maxFlowDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerMaxFlow(): void {
  registerAlgorithm<MaxFlowData>('maxFlow', maxFlowAlgorithm);
  registerProjector('maxFlowProjector', maxFlowProjector);
  for (const ir of maxFlowIRs) registerIR(ir.id, ir);
  registerView('max-flow-stage', maxFlowStageView);
  registerFacets([maxFlowFacet]);
  registerDescription(maxFlowFacet.id, maxFlowDescription);
}
