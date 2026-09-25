import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { schedulingPolicyAlgorithm, type SchedulingPolicyData } from './algorithm.js';
import { schedulingPolicyProjector } from './projector.js';
import { schedulingPolicyIRs } from './irs.js';
import { schedulingPolicyStageView } from './scheduling-policy-stage.js';
import { schedulingPolicyFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './scheduling-policy-stage.js';
export * from './facet.js';

export function registerSchedulingPolicy(): void {
  registerAlgorithm<SchedulingPolicyData>('schedulingPolicy', schedulingPolicyAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('schedulingPolicyProjector', schedulingPolicyProjector);
  for (const ir of schedulingPolicyIRs) registerIR(ir.id, ir);
  registerView('scheduling-policy-stage', schedulingPolicyStageView);
  registerFacets([schedulingPolicyFacet]);
}
