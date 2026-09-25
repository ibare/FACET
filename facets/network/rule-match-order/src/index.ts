import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { ruleMatchOrder, type RuleMatchOrderFacetData } from './algorithm.js';
import { ruleMatchOrderScene } from './scene.js';
import { ruleMatchOrderStageView } from './rule-match-order-stage.js';
import { ruleMatchOrderIRs } from './irs.js';
import { ruleMatchOrderFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { ruleMatchOrderStageView } from './rule-match-order-stage.js';
export { ruleMatchOrderIRs } from './irs.js';
export { ruleMatchOrderFacet } from './facet.js';

export function registerRuleMatchOrder(): void {
  registerAlgorithm<RuleMatchOrderFacetData>('ruleMatchOrder', ruleMatchOrder, { mechanismKind: 'reactive' });
  registerScenePlan('ruleMatchOrderScene', ruleMatchOrderScene);
  for (const ir of ruleMatchOrderIRs) registerIR(ir.id, ir);
  registerView('rule-match-order-stage', ruleMatchOrderStageView);
  registerFacets([ruleMatchOrderFacet]);
}
