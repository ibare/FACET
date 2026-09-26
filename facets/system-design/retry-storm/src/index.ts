import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { retryStorm, type RetryStormFacetData } from './algorithm';
import { retryStormFacet } from './facet';
import { retryStormIRs } from './irs';
import { retryStormStageView } from './retry-storm-stage';
import { retryStormScene } from './scene';

export { retryStorm, narrowRetryStormData, simulateRetryStorm } from './algorithm';
export type { RetryStormFacetData, RetryStormRow } from './algorithm';
export { retryStormScene } from './scene';
export type { RetryStormScene, RetryStormColumn, RetryStormArrival, RetryStormStep } from './scene';
export { retryStormStageView } from './retry-storm-stage';
export { retryStormIRs } from './irs';
export { retryStormFacet } from './facet';

export function registerRetryStorm(): void {
  registerAlgorithm<RetryStormFacetData>('retryStorm', retryStorm, { mechanismKind: 'reactive' });
  registerScenePlan('retryStormScene', retryStormScene);
  for (const ir of retryStormIRs) registerIR(ir.id, ir);
  registerView('retry-storm-stage', retryStormStageView);
  registerFacets([retryStormFacet]);
}
