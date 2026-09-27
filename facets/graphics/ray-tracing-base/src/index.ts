/**
 * 광선 추적 완제품 — 등록 진입점. 호출은 호스트의 몫이다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { rayTracingBaseAlgorithm, type RayTracingBaseData } from './algorithm.js';
import { rayTracingBaseFacet } from './facet.js';
import { rayTracingBaseIRs } from './irs.js';
import { rayTracingBaseProjector } from './projector.js';
import { rayTracingBaseStageView } from './ray-tracing-base-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './ray-tracing-base-stage.js';

export function registerRayTracingBase(): void {
  registerAlgorithm<RayTracingBaseData>('rayTracingBase', rayTracingBaseAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rayTracingBaseProjector', rayTracingBaseProjector);
  for (const ir of rayTracingBaseIRs) registerIR(ir.id, ir);
  registerView('ray-tracing-base-stage', rayTracingBaseStageView);
  registerFacets([rayTracingBaseFacet]);
}
