import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { tripAfterFailures, type TripAfterFailuresFacetData } from './algorithm.js';
import { tripAfterFailuresScene } from './scene.js';
import { tripAfterFailuresIRs } from './irs.js';
import { tripAfterFailuresStageView } from './trip-after-failures-stage.js';
import { tripAfterFailuresFacet } from './facet.js';

export {
  tripAfterFailures,
  readTripData,
  type TripAfterFailuresFacetData,
  type CallAnswer,
} from './algorithm.js';
export {
  tripAfterFailuresScene,
  type TripScene,
  type TripStep,
  type TripCounters,
  type CallTrace,
  type BreakerState,
} from './scene.js';
export { tripAfterFailuresIRs } from './irs.js';
export { tripAfterFailuresStageView } from './trip-after-failures-stage.js';
export { tripAfterFailuresFacet } from './facet.js';

export function registerTripAfterFailures(): void {
  registerAlgorithm<TripAfterFailuresFacetData>('tripAfterFailures', tripAfterFailures, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('tripAfterFailuresScene', tripAfterFailuresScene);
  for (const ir of tripAfterFailuresIRs) registerIR(ir.id, ir);
  registerView('trip-after-failures-stage', tripAfterFailuresStageView);
  registerFacets([tripAfterFailuresFacet]);
}
