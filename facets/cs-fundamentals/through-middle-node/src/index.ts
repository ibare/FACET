/**
 * through-middle-node 조각의 등록 진입점.
 *
 * 부르는 것은 호스트의 몫이다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { throughMiddleNodeAlgorithm, type ThroughMiddleNodeData } from './algorithm.js';
import { throughMiddleNodeFacet } from './facet.js';
import { throughMiddleNodeIRs } from './irs.js';
import { throughMiddleNodeScene } from './scene.js';
import { throughMiddleNodeStageView } from './through-middle-node-stage.js';

export { throughMiddleNodeAlgorithm } from './algorithm.js';
export type { ThroughMiddleNodeData, ThroughMiddleNodeEdge } from './algorithm.js';
export { throughMiddleNodeFacet } from './facet.js';
export { throughMiddleNodeIRs } from './irs.js';
export { throughMiddleNodeScene, type ThroughMiddleNodeScene } from './scene.js';
export { throughMiddleNodeStageView } from './through-middle-node-stage.js';

export function registerThroughMiddleNode(): void {
  registerAlgorithm<ThroughMiddleNodeData>('throughMiddleNode', throughMiddleNodeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('throughMiddleNodeScene', throughMiddleNodeScene);
  for (const ir of throughMiddleNodeIRs) registerIR(ir.id, ir);
  registerView('through-middle-node-stage', throughMiddleNodeStageView);
  registerFacets([throughMiddleNodeFacet]);
}
