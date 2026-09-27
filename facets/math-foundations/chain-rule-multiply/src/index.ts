import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { chainRuleMultiply, type ChainRuleMultiplyFacetData } from './algorithm.js';
import { chainRuleMultiplyStageView } from './chain-rule-multiply-stage.js';
import { chainRuleMultiplyFacet } from './facet.js';
import { chainRuleMultiplyIRs } from './irs.js';
import { chainRuleMultiplyScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export { chainRuleMultiplyStageView } from './chain-rule-multiply-stage.js';
export { chainRuleMultiplyIRs } from './irs.js';
export { chainRuleMultiplyFacet } from './facet.js';

export function registerChainRuleMultiply(): void {
  registerAlgorithm<ChainRuleMultiplyFacetData>('chainRuleMultiply', chainRuleMultiply, { mechanismKind: 'reactive' });
  registerScenePlan('chainRuleMultiplyScene', chainRuleMultiplyScene);
  for (const ir of chainRuleMultiplyIRs) registerIR(ir.id, ir);
  registerView('chain-rule-multiply-stage', chainRuleMultiplyStageView);
  registerFacets([chainRuleMultiplyFacet]);
}
