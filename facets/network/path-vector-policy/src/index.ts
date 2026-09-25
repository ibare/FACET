import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pathVectorPolicy } from './algorithm';
import { pathVectorPolicyScene } from './scene';
import { pathVectorPolicyStageView } from './path-vector-policy-stage';
import { pathVectorPolicyIRs } from './irs';
import { pathVectorPolicyFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './path-vector-policy-stage';
export * from './irs';
export * from './facet';

export function registerPathVectorPolicy(): void {
  registerAlgorithm<unknown>('pathVectorPolicy', pathVectorPolicy, { mechanismKind: 'reactive' });
  registerScenePlan('pathVectorPolicyScene', pathVectorPolicyScene);
  for (const ir of pathVectorPolicyIRs) registerIR(ir.id, ir);
  registerView('path-vector-policy-stage', pathVectorPolicyStageView);
  registerFacets([pathVectorPolicyFacet]);
}
