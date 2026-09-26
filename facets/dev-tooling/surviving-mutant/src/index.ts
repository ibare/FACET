import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { survivingMutant, type SurvivingMutantFacetData } from './algorithm.js';
import { survivingMutantScene } from './scene.js';
import { survivingMutantIRs } from './irs.js';
import { survivingMutantStageView } from './surviving-mutant-stage.js';
import { survivingMutantFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { survivingMutantIRs } from './irs.js';
export { survivingMutantStageView } from './surviving-mutant-stage.js';
export { survivingMutantFacet } from './facet.js';

export function registerSurvivingMutant(): void {
  registerAlgorithm<SurvivingMutantFacetData>('survivingMutant', survivingMutant, { mechanismKind: 'reactive' });
  registerScenePlan('survivingMutantScene', survivingMutantScene);
  for (const ir of survivingMutantIRs) registerIR(ir.id, ir);
  registerView('surviving-mutant-stage', survivingMutantStageView);
  registerFacets([survivingMutantFacet]);
}
