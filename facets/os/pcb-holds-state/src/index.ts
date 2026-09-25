import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pcbHoldsState, type PcbHoldsStateFacetData } from './algorithm.js';
import { pcbHoldsStateScene } from './scene.js';
import { pcbHoldsStateIRs } from './irs.js';
import { pcbHoldsStateStageView } from './pcb-holds-state-stage.js';
import { pcbHoldsStateFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './pcb-holds-state-stage.js';
export * from './facet.js';

export function registerPcbHoldsState(): void {
  registerAlgorithm<PcbHoldsStateFacetData>('pcbHoldsState', pcbHoldsState, { mechanismKind: 'reactive' });
  registerScenePlan('pcbHoldsStateScene', pcbHoldsStateScene);
  for (const ir of pcbHoldsStateIRs) registerIR(ir.id, ir);
  registerView('pcb-holds-state-stage', pcbHoldsStateStageView);
  registerFacets([pcbHoldsStateFacet]);
}
