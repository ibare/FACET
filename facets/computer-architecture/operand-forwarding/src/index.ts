import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { operandForwarding, type OperandForwardingFacetData } from './algorithm.js';
import { operandForwardingFacet } from './facet.js';
import { operandForwardingIRs } from './irs.js';
import { operandForwardingStageView } from './operand-forwarding-stage.js';
import { operandForwardingScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './operand-forwarding-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerOperandForwarding(): void {
  registerAlgorithm<OperandForwardingFacetData>('operandForwarding', operandForwarding, { mechanismKind: 'reactive' });
  registerScenePlan('operandForwardingScene', operandForwardingScene);
  for (const ir of operandForwardingIRs) registerIR(ir.id, ir);
  registerView('operand-forwarding-stage', operandForwardingStageView);
  registerFacets([operandForwardingFacet]);
}
