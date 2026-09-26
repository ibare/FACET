import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { pickOneOut, type PickOneOutFacetData } from './algorithm.js';
import { pickOneOutScene } from './scene.js';
import { pickOneOutStageView } from './pick-one-out-stage.js';
import { pickOneOutIRs } from './irs.js';
import { pickOneOutFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { pickOneOutStageView } from './pick-one-out-stage.js';
export { pickOneOutIRs } from './irs.js';
export { pickOneOutFacet } from './facet.js';

export function registerPickOneOut(): void {
  registerAlgorithm<PickOneOutFacetData>('pickOneOut', pickOneOut, { mechanismKind: 'reactive' });
  registerScenePlan('pickOneOutScene', pickOneOutScene);
  for (const ir of pickOneOutIRs) registerIR(ir.id, ir);
  registerView('pick-one-out-stage', pickOneOutStageView);
  registerFacets([pickOneOutFacet]);
}
