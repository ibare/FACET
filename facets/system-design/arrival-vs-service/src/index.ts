import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { arrivalVsService, type ArrivalVsServiceFacetData } from './algorithm.js';
import { arrivalVsServiceScene } from './scene.js';
import { arrivalVsServiceStageView } from './arrival-vs-service-stage.js';
import { arrivalVsServiceIRs } from './irs.js';
import { arrivalVsServiceFacet } from './facet.js';

export { arrivalVsService, readArrivalVsService, lastSecOf } from './algorithm.js';
export type { ArrivalVsServiceFacetData, ArrivalRequest } from './algorithm.js';
export { arrivalVsServiceScene } from './scene.js';
export type { ArrivalVsServiceScene, ArrivalVsServiceStep, CountAt } from './scene.js';
export { arrivalVsServiceStageView } from './arrival-vs-service-stage.js';
export { arrivalVsServiceIRs } from './irs.js';
export { arrivalVsServiceFacet } from './facet.js';

export function registerArrivalVsService(): void {
  registerAlgorithm<ArrivalVsServiceFacetData>('arrivalVsService', arrivalVsService, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('arrivalVsServiceScene', arrivalVsServiceScene);
  for (const ir of arrivalVsServiceIRs) registerIR(ir.id, ir);
  registerView('arrival-vs-service-stage', arrivalVsServiceStageView);
  registerFacets([arrivalVsServiceFacet]);
}
