import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { requestResponse, type RequestResponseFacetData } from './algorithm.js';
import { requestResponseScene } from './scene.js';
import { requestResponseIRs } from './irs.js';
import { requestResponseStageView } from './request-response-stage.js';
import { requestResponseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './request-response-stage.js';
export * from './facet.js';

export function registerRequestResponse(): void {
  registerAlgorithm<RequestResponseFacetData>('requestResponse', requestResponse, { mechanismKind: 'reactive' });
  registerScenePlan('requestResponseScene', requestResponseScene);
  for (const ir of requestResponseIRs) registerIR(ir.id, ir);
  registerView('request-response-stage', requestResponseStageView);
  registerFacets([requestResponseFacet]);
}
