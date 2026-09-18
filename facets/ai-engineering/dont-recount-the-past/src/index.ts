import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { dontRecountThePast, type DontRecountThePastFacetData } from './algorithm.js';
import { dontRecountThePastScene } from './scene.js';
import { dontRecountThePastStageView } from './dont-recount-the-past-stage.js';
import { dontRecountThePastIRs } from './irs.js';
import { dontRecountThePastFacet } from './facet.js';

export { dontRecountThePast, type DontRecountThePastFacetData } from './algorithm.js';
export {
  dontRecountThePastScene,
  type DontRecountThePastScene,
  type DontRecountThePastStep,
} from './scene.js';
export { dontRecountThePastStageView } from './dont-recount-the-past-stage.js';
export { dontRecountThePastIRs } from './irs.js';
export { dontRecountThePastFacet } from './facet.js';

export function registerDontRecountThePast(): void {
  registerAlgorithm<DontRecountThePastFacetData>('dontRecountThePast', dontRecountThePast, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('dontRecountThePastScene', dontRecountThePastScene);
  for (const ir of dontRecountThePastIRs) registerIR(ir.id, ir);
  registerView('dont-recount-the-past-stage', dontRecountThePastStageView);
  registerFacets([dontRecountThePastFacet]);
}
