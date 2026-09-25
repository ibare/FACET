import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { switchCosts, type SwitchCostsFacetData } from './algorithm.js';
import { switchCostsScene } from './scene.js';
import { switchCostsIRs } from './irs.js';
import { switchCostsStageView } from './switch-costs-stage.js';
import { switchCostsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './switch-costs-stage.js';
export * from './facet.js';

export function registerSwitchCosts(): void {
  registerAlgorithm<SwitchCostsFacetData>('switchCosts', switchCosts, { mechanismKind: 'reactive' });
  registerScenePlan('switchCostsScene', switchCostsScene);
  for (const ir of switchCostsIRs) registerIR(ir.id, ir);
  registerView('switch-costs-stage', switchCostsStageView);
  registerFacets([switchCostsFacet]);
}
