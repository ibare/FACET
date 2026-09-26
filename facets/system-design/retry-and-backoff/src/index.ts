/**
 * 재시도와 백오프 — 등록. 손잡이가 있어 mechanismKind 는 reactive.
 */
import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { retryAndBackoffAlgorithm, type RetryAndBackoffData } from './algorithm.js';
import { retryAndBackoffProjector } from './projector.js';
import { retryAndBackoffIRs } from './irs.js';
import { retryAndBackoffStageView } from './retry-and-backoff-stage.js';
import { retryAndBackoffFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './retry-and-backoff-stage.js';
export * from './facet.js';

export function registerRetryAndBackoff(): void {
  registerAlgorithm<RetryAndBackoffData>('retryAndBackoff', retryAndBackoffAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('retryAndBackoffProjector', retryAndBackoffProjector);
  for (const ir of retryAndBackoffIRs) registerIR(ir.id, ir);
  registerView('retry-and-backoff-stage', retryAndBackoffStageView);
  registerFacets([retryAndBackoffFacet]);
}
