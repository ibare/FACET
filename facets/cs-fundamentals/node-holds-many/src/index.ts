/**
 * node-holds-many — 등록 진입점. 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { nodeHoldsManyAlgorithm } from './algorithm.js';
import { nodeHoldsManyScene } from './scene.js';
import { nodeHoldsManyIRs } from './irs.js';
import { nodeHoldsManyFacet } from './facet.js';
import { nodeHoldsManyStageView } from './node-holds-many-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';
export * from './node-holds-many-stage.js';

export function registerNodeHoldsMany(): void {
  registerAlgorithm('nodeHoldsMany', nodeHoldsManyAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('nodeHoldsManyScene', nodeHoldsManyScene);
  for (const ir of nodeHoldsManyIRs) registerIR(ir.id, ir);
  registerView('node-holds-many-stage', nodeHoldsManyStageView);
  registerFacets([nodeHoldsManyFacet]);
}
