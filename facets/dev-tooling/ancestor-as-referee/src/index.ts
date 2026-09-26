import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { ancestorAsReferee, type AncestorAsRefereeFacetData } from './algorithm';
import { ancestorAsRefereeScene } from './scene';
import { ancestorAsRefereeIRs } from './irs';
import { ancestorAsRefereeStageView } from './ancestor-as-referee-stage';
import { ancestorAsRefereeFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './ancestor-as-referee-stage';
export * from './facet';

export function registerAncestorAsReferee(): void {
  registerAlgorithm<AncestorAsRefereeFacetData>('ancestorAsReferee', ancestorAsReferee, { mechanismKind: 'reactive' });
  registerScenePlan('ancestorAsRefereeScene', ancestorAsRefereeScene);
  for (const ir of ancestorAsRefereeIRs) registerIR(ir.id, ir);
  registerView('ancestor-as-referee-stage', ancestorAsRefereeStageView);
  registerFacets([ancestorAsRefereeFacet]);
}
