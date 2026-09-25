import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { interruptPreempts, type InterruptPreemptsFacetData } from './algorithm';
import { interruptPreemptsScene } from './scene';
import { interruptPreemptsIRs } from './irs';
import { interruptPreemptsStageView } from './interrupt-preempts-stage';
import { interruptPreemptsFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './interrupt-preempts-stage';
export * from './facet';

export function registerInterruptPreempts(): void {
  registerAlgorithm<InterruptPreemptsFacetData>('interruptPreempts', interruptPreempts, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('interruptPreemptsScene', interruptPreemptsScene);
  for (const ir of interruptPreemptsIRs) registerIR(ir.id, ir);
  registerView('interrupt-preempts-stage', interruptPreemptsStageView);
  registerFacets([interruptPreemptsFacet]);
}
