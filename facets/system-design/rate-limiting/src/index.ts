/**
 * 레이트 리미팅 facet — 등록은 `registerRateLimiting()` 하나로.
 */

import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { rateLimitingAlgorithm, type RateLimitingData } from './algorithm.js';
import { rateLimitingFacet } from './facet.js';
import { rateLimitingIRs } from './irs.js';
import { rateLimitingProjector } from './projector.js';
import { rateLimitingStageView } from './rate-limiting-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './rate-limiting-stage.js';

export function registerRateLimiting(): void {
  registerAlgorithm<RateLimitingData>('rateLimiting', rateLimitingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rateLimitingProjector', rateLimitingProjector);
  for (const ir of rateLimitingIRs) registerIR(ir.id, ir);
  registerView('rate-limiting-stage', rateLimitingStageView);
  registerFacets([rateLimitingFacet]);
}
