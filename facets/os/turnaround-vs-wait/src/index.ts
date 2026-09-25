import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { turnaroundVsWait, type TurnaroundVsWaitFacetData } from './algorithm';
import { turnaroundVsWaitScene } from './scene';
import { turnaroundVsWaitStageView } from './turnaround-vs-wait-stage';
import { turnaroundVsWaitIRs } from './irs';
import { turnaroundVsWaitFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './turnaround-vs-wait-stage';
export * from './irs';
export * from './facet';

export function registerTurnaroundVsWait(): void {
  registerAlgorithm<TurnaroundVsWaitFacetData>('turnaroundVsWait', turnaroundVsWait, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('turnaroundVsWaitScene', turnaroundVsWaitScene);
  for (const ir of turnaroundVsWaitIRs) registerIR(ir.id, ir);
  registerView('turnaround-vs-wait-stage', turnaroundVsWaitStageView);
  registerFacets([turnaroundVsWaitFacet]);
}
