import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shedToSurvive, type ShedToSurviveFacetData } from './algorithm';
import { shedToSurviveScene } from './scene';
import { shedToSurviveStageView } from './shed-to-survive-stage';
import { shedToSurviveIRs } from './irs';
import { shedToSurviveFacet } from './facet';

export { shedToSurvive, narrowShedData, requestOrder, type ShedToSurviveFacetData } from './algorithm';
export { shedToSurviveScene, type ShedToSurviveScene } from './scene';
export { shedToSurviveStageView } from './shed-to-survive-stage';
export { shedToSurviveIRs } from './irs';
export { shedToSurviveFacet } from './facet';

export function registerShedToSurvive(): void {
  registerAlgorithm<ShedToSurviveFacetData>('shedToSurvive', shedToSurvive, { mechanismKind: 'reactive' });
  registerScenePlan('shedToSurviveScene', shedToSurviveScene);
  for (const ir of shedToSurviveIRs) registerIR(ir.id, ir);
  registerView('shed-to-survive-stage', shedToSurviveStageView);
  registerFacets([shedToSurviveFacet]);
}
