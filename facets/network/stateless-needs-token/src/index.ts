import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { statelessNeedsToken, type StatelessNeedsTokenFacetData } from './algorithm.js';
import { statelessNeedsTokenScene } from './scene.js';
import { statelessNeedsTokenStageView } from './stateless-needs-token-stage.js';
import { statelessNeedsTokenIRs } from './irs.js';
import { statelessNeedsTokenFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './stateless-needs-token-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerStatelessNeedsToken(): void {
  registerAlgorithm<StatelessNeedsTokenFacetData>('statelessNeedsToken', statelessNeedsToken, { mechanismKind: 'reactive' });
  registerScenePlan('statelessNeedsTokenScene', statelessNeedsTokenScene);
  for (const ir of statelessNeedsTokenIRs) registerIR(ir.id, ir);
  registerView('stateless-needs-token-stage', statelessNeedsTokenStageView);
  registerFacets([statelessNeedsTokenFacet]);
}
