import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { ruleExpands, type RuleExpandsFacetData } from './algorithm.js';
import { ruleExpandsScene } from './scene.js';
import { ruleExpandsIRs } from './irs.js';
import { ruleExpandsStageView } from './rule-expands-stage.js';
import { ruleExpandsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './rule-expands-stage.js';
export * from './facet.js';

export function registerRuleExpands(): void {
  registerAlgorithm<RuleExpandsFacetData>('ruleExpands', ruleExpands, { mechanismKind: 'reactive' });
  registerScenePlan('ruleExpandsScene', ruleExpandsScene);
  for (const ir of ruleExpandsIRs) registerIR(ir.id, ir);
  registerView('rule-expands-stage', ruleExpandsStageView);
  registerFacets([ruleExpandsFacet]);
}
