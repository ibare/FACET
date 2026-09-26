import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lengthIsRateTimesWait, type LengthIsRateTimesWaitFacetData } from './algorithm.js';
import { lengthIsRateTimesWaitScene } from './scene.js';
import { lengthIsRateTimesWaitStageView } from './length-is-rate-times-wait-stage.js';
import { lengthIsRateTimesWaitIRs } from './irs.js';
import { lengthIsRateTimesWaitFacet } from './facet.js';

export {
  lengthIsRateTimesWait,
  narrowLengthIsRateTimesWait,
  scheduleRequests,
  type LengthIsRateTimesWaitFacetData,
  type QueueRequest,
  type ScheduledRequest,
} from './algorithm.js';
export {
  lengthIsRateTimesWaitScene,
  type LengthIsRateTimesWaitScene,
  type LittleStep,
  type RevealedStay,
  type BalanceResult,
} from './scene.js';
export { lengthIsRateTimesWaitStageView } from './length-is-rate-times-wait-stage.js';
export { lengthIsRateTimesWaitIRs } from './irs.js';
export { lengthIsRateTimesWaitFacet } from './facet.js';

export function registerLengthIsRateTimesWait(): void {
  registerAlgorithm<LengthIsRateTimesWaitFacetData>('lengthIsRateTimesWait', lengthIsRateTimesWait, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('lengthIsRateTimesWaitScene', lengthIsRateTimesWaitScene);
  for (const ir of lengthIsRateTimesWaitIRs) registerIR(ir.id, ir);
  registerView('length-is-rate-times-wait-stage', lengthIsRateTimesWaitStageView);
  registerFacets([lengthIsRateTimesWaitFacet]);
}
