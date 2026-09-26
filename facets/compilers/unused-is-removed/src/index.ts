import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { unusedIsRemoved, type UnusedIsRemovedFacetData } from './algorithm';
import { unusedIsRemovedFacet } from './facet';
import { unusedIsRemovedIRs } from './irs';
import { unusedIsRemovedScene } from './scene';
import { unusedIsRemovedStageView } from './unused-is-removed-stage';

export * from './algorithm';
export * from './scene';
export { unusedIsRemovedStageView } from './unused-is-removed-stage';
export { unusedIsRemovedIRs } from './irs';
export { unusedIsRemovedFacet } from './facet';

export function registerUnusedIsRemoved(): void {
  registerAlgorithm<UnusedIsRemovedFacetData>('unusedIsRemoved', unusedIsRemoved, { mechanismKind: 'reactive' });
  registerScenePlan('unusedIsRemovedScene', unusedIsRemovedScene);
  for (const ir of unusedIsRemovedIRs) registerIR(ir.id, ir);
  registerView('unused-is-removed-stage', unusedIsRemovedStageView);
  registerFacets([unusedIsRemovedFacet]);
}
