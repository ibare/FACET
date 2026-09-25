import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { priorityAgingAlgorithm, type PriorityAgingData } from './algorithm.js';
import { priorityAgingFacet } from './facet.js';
import { priorityAgingIRs } from './irs.js';
import { priorityAgingProjector } from './projector.js';
import { priorityAgingStageView } from './priority-aging-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './priority-aging-stage.js';

export function registerPriorityAging(): void {
  registerAlgorithm<PriorityAgingData>('priorityAging', priorityAgingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('priorityAgingProjector', priorityAgingProjector);
  for (const ir of priorityAgingIRs) registerIR(ir.id, ir);
  registerView('priority-aging-stage', priorityAgingStageView);
  registerFacets([priorityAgingFacet]);
}
