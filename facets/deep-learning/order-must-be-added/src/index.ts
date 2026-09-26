import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { orderMustBeAdded, type OrderMustBeAddedFacetData } from './algorithm.js';
import { orderMustBeAddedScene } from './scene.js';
import { orderMustBeAddedIRs } from './irs.js';
import { orderMustBeAddedStageView } from './order-must-be-added-stage.js';
import { orderMustBeAddedFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { orderMustBeAddedIRs } from './irs.js';
export { orderMustBeAddedStageView } from './order-must-be-added-stage.js';
export { orderMustBeAddedFacet } from './facet.js';

export function registerOrderMustBeAdded(): void {
  registerAlgorithm<OrderMustBeAddedFacetData>('orderMustBeAdded', orderMustBeAdded, { mechanismKind: 'reactive' });
  registerScenePlan('orderMustBeAddedScene', orderMustBeAddedScene);
  for (const ir of orderMustBeAddedIRs) registerIR(ir.id, ir);
  registerView('order-must-be-added-stage', orderMustBeAddedStageView);
  registerFacets([orderMustBeAddedFacet]);
}
