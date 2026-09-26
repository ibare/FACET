import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { oneSideChanged, type OneSideChangedFacetData } from './algorithm';
import { oneSideChangedScene } from './scene';
import { oneSideChangedStageView } from './one-side-changed-stage';
import { oneSideChangedIRs } from './irs';
import { oneSideChangedFacet } from './facet';

export * from './algorithm';
export * from './scene';
export { oneSideChangedStageView } from './one-side-changed-stage';
export { oneSideChangedIRs } from './irs';
export { oneSideChangedFacet } from './facet';

export function registerOneSideChanged(): void {
  registerAlgorithm<OneSideChangedFacetData>('oneSideChanged', oneSideChanged, { mechanismKind: 'reactive' });
  registerScenePlan('oneSideChangedScene', oneSideChangedScene);
  for (const ir of oneSideChangedIRs) registerIR(ir.id, ir);
  registerView('one-side-changed-stage', oneSideChangedStageView);
  registerFacets([oneSideChangedFacet]);
}
