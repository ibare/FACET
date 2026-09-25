import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { noPreemption, type NoPreemptionFacetData } from './algorithm';
import { noPreemptionScene } from './scene';
import { noPreemptionIRs } from './irs';
import { noPreemptionStageView } from './no-preemption-stage';
import { noPreemptionFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './no-preemption-stage';
export * from './facet';

export function registerNoPreemption(): void {
  registerAlgorithm<NoPreemptionFacetData>('noPreemption', noPreemption, { mechanismKind: 'reactive' });
  registerScenePlan('noPreemptionScene', noPreemptionScene);
  for (const ir of noPreemptionIRs) registerIR(ir.id, ir);
  registerView('no-preemption-stage', noPreemptionStageView);
  registerFacets([noPreemptionFacet]);
}
