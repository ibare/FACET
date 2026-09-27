import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { partialSlice, type PartialSliceFacetData } from './algorithm.js';
import { partialSliceScene } from './scene.js';
import { partialSliceStageView } from './partial-slice-stage.js';
import { partialSliceIRs } from './irs.js';
import { partialSliceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { partialSliceStageView } from './partial-slice-stage.js';
export { partialSliceIRs } from './irs.js';
export { partialSliceFacet } from './facet.js';

export function registerPartialSlice(): void {
  registerAlgorithm<PartialSliceFacetData>('partialSlice', partialSlice, { mechanismKind: 'reactive' });
  registerScenePlan('partialSliceScene', partialSliceScene);
  for (const ir of partialSliceIRs) registerIR(ir.id, ir);
  registerView('partial-slice-stage', partialSliceStageView);
  registerFacets([partialSliceFacet]);
}
