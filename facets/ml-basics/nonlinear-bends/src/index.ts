import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nonlinearBends, type NonlinearBendsFacetData } from './algorithm.js';
import { nonlinearBendsScene } from './scene.js';
import { nonlinearBendsStageView } from './nonlinear-bends-stage.js';
import { nonlinearBendsIRs } from './irs.js';
import { nonlinearBendsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { nonlinearBendsStageView } from './nonlinear-bends-stage.js';
export { nonlinearBendsIRs } from './irs.js';
export { nonlinearBendsFacet } from './facet.js';

export function registerNonlinearBends(): void {
  registerAlgorithm<NonlinearBendsFacetData>('nonlinearBends', nonlinearBends, { mechanismKind: 'reactive' });
  registerScenePlan('nonlinearBendsScene', nonlinearBendsScene);
  for (const ir of nonlinearBendsIRs) registerIR(ir.id, ir);
  registerView('nonlinear-bends-stage', nonlinearBendsStageView);
  registerFacets([nonlinearBendsFacet]);
}
