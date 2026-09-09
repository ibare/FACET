/**
 * through-middle-node 조각의 등록 진입점.
 *
 * 부르는 것은 호스트의 몫이다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { throughMiddleNodeAlgorithm, type ThroughMiddleNodeData } from './algorithm.js';
import { throughMiddleNodeDescription } from './description.js';
import { throughMiddleNodeFacet } from './facet.js';
import { throughMiddleNodeIRs } from './irs.js';
import { throughMiddleNodeProjector } from './projector.js';
import { throughMiddleNodeStageView } from './through-middle-node-stage.js';

export { throughMiddleNodeAlgorithm } from './algorithm.js';
export type { ThroughMiddleNodeData, ThroughMiddleNodeEdge } from './algorithm.js';
export { throughMiddleNodeDescription } from './description.js';
export { throughMiddleNodeFacet } from './facet.js';
export { throughMiddleNodeIRs } from './irs.js';
export { throughMiddleNodeProjector } from './projector.js';
export { throughMiddleNodeStageView } from './through-middle-node-stage.js';

export function registerThroughMiddleNode(): void {
  registerAlgorithm<ThroughMiddleNodeData>('throughMiddleNode', throughMiddleNodeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('throughMiddleNodeProjector', throughMiddleNodeProjector);
  for (const ir of throughMiddleNodeIRs) registerIR(ir.id, ir);
  registerView('through-middle-node-stage', throughMiddleNodeStageView);
  registerFacets([throughMiddleNodeFacet]);
  registerDescription(throughMiddleNodeFacet.id, throughMiddleNodeDescription);
}
