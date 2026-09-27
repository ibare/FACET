import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { shadowRay, type ShadowRayFacetData } from './algorithm';
import { shadowRayScene } from './scene';
import { shadowRayStageView } from './shadow-ray-stage';
import { shadowRayIRs } from './irs';
import { shadowRayFacet } from './facet';

export * from './algorithm';
export * from './scene';
export { shadowRayStageView } from './shadow-ray-stage';
export { shadowRayIRs } from './irs';
export { shadowRayFacet } from './facet';

export function registerShadowRay(): void {
  registerAlgorithm<ShadowRayFacetData>('shadowRay', shadowRay, { mechanismKind: 'reactive' });
  registerScenePlan('shadowRayScene', shadowRayScene);
  for (const ir of shadowRayIRs) registerIR(ir.id, ir);
  registerView('shadow-ray-stage', shadowRayStageView);
  registerFacets([shadowRayFacet]);
}
