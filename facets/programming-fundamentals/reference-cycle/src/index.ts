import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { referenceCycle, type ReferenceCycleFacetData } from './algorithm.js';
import { referenceCycleScene } from './scene.js';
import { referenceCycleStageView } from './reference-cycle-stage.js';
import { referenceCycleIRs } from './irs.js';
import { referenceCycleFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './reference-cycle-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerReferenceCycle(): void {
  registerAlgorithm<ReferenceCycleFacetData>('referenceCycle', referenceCycle, { mechanismKind: 'reactive' });
  registerScenePlan('referenceCycleScene', referenceCycleScene);
  for (const ir of referenceCycleIRs) registerIR(ir.id, ir);
  registerView('reference-cycle-stage', referenceCycleStageView);
  registerFacets([referenceCycleFacet]);
}
