import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { policyGradientAlgorithm, type PolicyGradientData } from './algorithm.js';
import { policyGradientFacet } from './facet.js';
import { policyGradientIRs } from './irs.js';
import { policyGradientStageView } from './policy-gradient-stage.js';
import { policyGradientProjector } from './projector.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './policy-gradient-stage.js';
export * from './projector.js';

export function registerPolicyGradient(): void {
  registerAlgorithm<PolicyGradientData>('policyGradient', policyGradientAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('policyGradientProjector', policyGradientProjector);
  for (const ir of policyGradientIRs) registerIR(ir.id, ir);
  registerView('policy-gradient-stage', policyGradientStageView);
  registerFacets([policyGradientFacet]);
}
