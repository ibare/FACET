import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { tokenBearer, type TokenBearerFacetData } from './algorithm.js';
import { tokenBearerScene } from './scene.js';
import { tokenBearerStageView } from './token-bearer-stage.js';
import { tokenBearerIRs } from './irs.js';
import { tokenBearerFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './token-bearer-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerTokenBearer(): void {
  registerAlgorithm<TokenBearerFacetData>('tokenBearer', tokenBearer, { mechanismKind: 'reactive' });
  registerScenePlan('tokenBearerScene', tokenBearerScene);
  for (const ir of tokenBearerIRs) registerIR(ir.id, ir);
  registerView('token-bearer-stage', tokenBearerStageView);
  registerFacets([tokenBearerFacet]);
}
