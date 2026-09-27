import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { productRuleTree, type ProductRuleTreeFacetData } from './algorithm.js';
import { productRuleTreeScene } from './scene.js';
import { productRuleTreeStageView } from './product-rule-tree-stage.js';
import { productRuleTreeIRs } from './irs.js';
import { productRuleTreeFacet } from './facet.js';

export { productRuleTree, narrowProductRuleTreeData, spanBelow } from './algorithm.js';
export type { ProductRuleTreeFacetData, ProductRuleTreeEnd } from './algorithm.js';
export { productRuleTreeScene } from './scene.js';
export type { ProductRuleTreeScene, ProductRuleTreeStep } from './scene.js';
export { productRuleTreeStageView } from './product-rule-tree-stage.js';
export { productRuleTreeIRs } from './irs.js';
export { productRuleTreeFacet } from './facet.js';

export function registerProductRuleTree(): void {
  registerAlgorithm<ProductRuleTreeFacetData>('productRuleTree', productRuleTree, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('productRuleTreeScene', productRuleTreeScene);
  for (const ir of productRuleTreeIRs) registerIR(ir.id, ir);
  registerView('product-rule-tree-stage', productRuleTreeStageView);
  registerFacets([productRuleTreeFacet]);
}
