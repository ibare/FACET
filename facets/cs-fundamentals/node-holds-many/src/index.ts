/**
 * node-holds-many — 등록 진입점. 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import { registerAlgorithm, registerDescription, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';

import { nodeHoldsManyAlgorithm } from './algorithm.js';
import { nodeHoldsManyProjector } from './projector.js';
import { nodeHoldsManyIRs } from './irs.js';
import { nodeHoldsManyFacet } from './facet.js';
import { nodeHoldsManyDescription } from './description.js';
import { nodeHoldsManyStageView } from './node-holds-many-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './facet.js';
export * from './description.js';
export * from './node-holds-many-stage.js';

export function registerNodeHoldsMany(): void {
  registerAlgorithm('nodeHoldsMany', nodeHoldsManyAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('nodeHoldsManyProjector', nodeHoldsManyProjector);
  for (const ir of nodeHoldsManyIRs) registerIR(ir.id, ir);
  registerView('node-holds-many-stage', nodeHoldsManyStageView);
  registerFacets([nodeHoldsManyFacet]);
  registerDescription(nodeHoldsManyFacet.id, nodeHoldsManyDescription);
}
