import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { discountFuture, type DiscountFutureFacetData } from './algorithm';
import { discountFutureScene } from './scene';
import { discountFutureStageView } from './discount-future-stage';
import { discountFutureIRs } from './irs';
import { discountFutureFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './discount-future-stage';
export * from './irs';
export * from './facet';

export function registerDiscountFuture(): void {
  registerAlgorithm<DiscountFutureFacetData>('discountFuture', discountFuture, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('discountFutureScene', discountFutureScene);
  for (const ir of discountFutureIRs) registerIR(ir.id, ir);
  registerView('discount-future-stage', discountFutureStageView);
  registerFacets([discountFutureFacet]);
}
