import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { typeMismatch, type TypeMismatchFacetData } from './algorithm.js';
import { typeMismatchFacet } from './facet.js';
import { typeMismatchIRs } from './irs.js';
import { typeMismatchScene } from './scene.js';
import { typeMismatchStageView } from './type-mismatch-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export { typeMismatchStageView } from './type-mismatch-stage.js';
export { typeMismatchIRs } from './irs.js';
export { typeMismatchFacet } from './facet.js';

export function registerTypeMismatch(): void {
  registerAlgorithm<TypeMismatchFacetData>('typeMismatch', typeMismatch, { mechanismKind: 'reactive' });
  registerScenePlan('typeMismatchScene', typeMismatchScene);
  for (const ir of typeMismatchIRs) registerIR(ir.id, ir);
  registerView('type-mismatch-stage', typeMismatchStageView);
  registerFacets([typeMismatchFacet]);
}
