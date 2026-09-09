/**
 * negativeEdgeBreaks 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { negativeEdgeBreaksAlgorithm } from './algorithm.js';
import { negativeEdgeBreaksDescription } from './description.js';
import { negativeEdgeBreaksFacet } from './facet.js';
import { negativeEdgeBreaksIRs } from './irs.js';
import { negativeEdgeBreaksProjector } from './projector.js';
import { negativeEdgeBreaksStageView } from './negative-edge-breaks-stage.js';

export { negativeEdgeBreaksAlgorithm } from './algorithm.js';
export type { NegativeEdge, NegativeEdgeBreaksData } from './algorithm.js';
export { negativeEdgeBreaksDescription } from './description.js';
export { negativeEdgeBreaksFacet } from './facet.js';
export { negativeEdgeBreaksIRs } from './irs.js';
export { negativeEdgeBreaksProjector } from './projector.js';
export { negativeEdgeBreaksStageView } from './negative-edge-breaks-stage.js';
export type { NegativeEdgeSpec, NegativeGraphSpec } from './negative-edge-breaks-stage.js';

export function registerNegativeEdgeBreaks(): void {
  registerAlgorithm('negativeEdgeBreaks', negativeEdgeBreaksAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('negativeEdgeBreaksProjector', negativeEdgeBreaksProjector);
  for (const ir of negativeEdgeBreaksIRs) registerIR(ir.id, ir);
  registerView('negative-edge-breaks-stage', negativeEdgeBreaksStageView);
  registerFacets([negativeEdgeBreaksFacet]);
  registerDescription(negativeEdgeBreaksFacet.id, negativeEdgeBreaksDescription);
}
