import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { priorityPreempt, type PriorityPreemptFacetData } from './algorithm.js';
import { priorityPreemptScene } from './scene.js';
import { priorityPreemptIRs } from './irs.js';
import { priorityPreemptStageView } from './priority-preempt-stage.js';
import { priorityPreemptFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './priority-preempt-stage.js';
export * from './facet.js';

export function registerPriorityPreempt(): void {
  registerAlgorithm<PriorityPreemptFacetData>('priorityPreempt', priorityPreempt, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('priorityPreemptScene', priorityPreemptScene);
  for (const ir of priorityPreemptIRs) registerIR(ir.id, ir);
  registerView('priority-preempt-stage', priorityPreemptStageView);
  registerFacets([priorityPreemptFacet]);
}
