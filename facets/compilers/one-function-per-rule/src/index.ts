import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { oneFunctionPerRule, type OneFunctionPerRuleFacetData } from './algorithm.js';
import { oneFunctionPerRuleScene } from './scene.js';
import { oneFunctionPerRuleStageView } from './one-function-per-rule-stage.js';
import { oneFunctionPerRuleIRs } from './irs.js';
import { oneFunctionPerRuleFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { oneFunctionPerRuleStageView } from './one-function-per-rule-stage.js';
export { oneFunctionPerRuleIRs } from './irs.js';
export { oneFunctionPerRuleFacet } from './facet.js';

export function registerOneFunctionPerRule(): void {
  registerAlgorithm<OneFunctionPerRuleFacetData>('oneFunctionPerRule', oneFunctionPerRule, { mechanismKind: 'reactive' });
  registerScenePlan('oneFunctionPerRuleScene', oneFunctionPerRuleScene);
  for (const ir of oneFunctionPerRuleIRs) registerIR(ir.id, ir);
  registerView('one-function-per-rule-stage', oneFunctionPerRuleStageView);
  registerFacets([oneFunctionPerRuleFacet]);
}
