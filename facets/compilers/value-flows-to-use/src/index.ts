import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { valueFlowsToUse, type ValueFlowsToUseFacetData } from './algorithm.js';
import { valueFlowsToUseScene } from './scene.js';
import { valueFlowsToUseStageView } from './value-flows-to-use-stage.js';
import { valueFlowsToUseIRs } from './irs.js';
import { valueFlowsToUseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './value-flows-to-use-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerValueFlowsToUse(): void {
  registerAlgorithm<ValueFlowsToUseFacetData>('valueFlowsToUse', valueFlowsToUse, { mechanismKind: 'reactive' });
  registerScenePlan('valueFlowsToUseScene', valueFlowsToUseScene);
  for (const ir of valueFlowsToUseIRs) registerIR(ir.id, ir);
  registerView('value-flows-to-use-stage', valueFlowsToUseStageView);
  registerFacets([valueFlowsToUseFacet]);
}
