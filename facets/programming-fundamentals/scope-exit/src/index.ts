import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { scopeExit, type ScopeExitFacetData } from './algorithm.js';
import { scopeExitScene } from './scene.js';
import { scopeExitIRs } from './irs.js';
import { scopeExitStageView } from './scope-exit-stage.js';
import { scopeExitFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './scope-exit-stage.js';
export * from './facet.js';

export function registerScopeExit(): void {
  registerAlgorithm<ScopeExitFacetData>('scopeExit', scopeExit, { mechanismKind: 'reactive' });
  registerScenePlan('scopeExitScene', scopeExitScene);
  for (const ir of scopeExitIRs) registerIR(ir.id, ir);
  registerView('scope-exit-stage', scopeExitStageView);
  registerFacets([scopeExitFacet]);
}
