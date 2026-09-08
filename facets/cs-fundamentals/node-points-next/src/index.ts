/**
 * node-points-next 조각의 등록 진입점.
 *
 * 부수효과로 자동 등록하지 않는다 — 호출은 호스트 앱의 책임이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { nodePointsNextAlgorithm } from './algorithm.js';
import { nodePointsNextDescription } from './description.js';
import { nodePointsNextFacet } from './facet.js';
import { nodePointsNextIRs } from './irs.js';
import { nodePointsNextProjector } from './projector.js';
import { nodePointsNextStageView } from './node-points-next-stage.js';

export { nodePointsNextAlgorithm } from './algorithm.js';
export type { NodePointsNextData, NodePointsNextNode } from './algorithm.js';
export { nodePointsNextProjector } from './projector.js';
export { nodePointsNextIRs } from './irs.js';
export { nodePointsNextFacet } from './facet.js';
export { nodePointsNextDescription } from './description.js';
export { nodePointsNextStageView } from './node-points-next-stage.js';
export type {
  NodePointsNextStageInit,
  NodePointsNextStageNode,
} from './node-points-next-stage.js';

export function registerNodePointsNext(): void {
  registerAlgorithm('nodePointsNext', nodePointsNextAlgorithm, {
    // 조각은 mount 시 스스로 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('nodePointsNextProjector', nodePointsNextProjector);
  for (const ir of nodePointsNextIRs) registerIR(ir.id, ir);
  registerView('node-points-next-stage', nodePointsNextStageView);
  registerFacets([nodePointsNextFacet]);
  registerDescription(nodePointsNextFacet.id, nodePointsNextDescription);
}
