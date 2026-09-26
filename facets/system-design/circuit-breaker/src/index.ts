/**
 * 서킷 브레이커 완제품 — 등록 진입점. 손잡이(문턱 · 열림 기다림)가 있어 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { circuitBreakerAlgorithm, type CircuitBreakerData } from './algorithm.js';
import { circuitBreakerProjector } from './projector.js';
import { circuitBreakerIRs } from './irs.js';
import { circuitBreakerStageView } from './circuit-breaker-stage.js';
import { circuitBreakerFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './circuit-breaker-stage.js';
export * from './facet.js';

export function registerCircuitBreaker(): void {
  registerAlgorithm<CircuitBreakerData>('circuitBreaker', circuitBreakerAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('circuitBreakerProjector', circuitBreakerProjector);
  for (const ir of circuitBreakerIRs) registerIR(ir.id, ir);
  registerView('circuit-breaker-stage', circuitBreakerStageView);
  registerFacets([circuitBreakerFacet]);
}
