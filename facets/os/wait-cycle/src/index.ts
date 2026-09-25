import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { waitCycle, type WaitCycleFacetData } from './algorithm.js';
import { waitCycleScene } from './scene.js';
import { waitCycleStageView } from './wait-cycle-stage.js';
import { waitCycleIRs } from './irs.js';
import { waitCycleFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './wait-cycle-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWaitCycle(): void {
  registerAlgorithm<WaitCycleFacetData>('waitCycle', waitCycle, { mechanismKind: 'reactive' });
  registerScenePlan('waitCycleScene', waitCycleScene);
  for (const ir of waitCycleIRs) registerIR(ir.id, ir);
  registerView('wait-cycle-stage', waitCycleStageView);
  registerFacets([waitCycleFacet]);
}
