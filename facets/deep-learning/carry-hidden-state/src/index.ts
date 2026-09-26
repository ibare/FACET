import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { carryHiddenState, type CarryHiddenStateFacetData } from './algorithm.js';
import { carryHiddenStateScene } from './scene.js';
import { carryHiddenStateStageView } from './carry-hidden-state-stage.js';
import { carryHiddenStateIRs } from './irs.js';
import { carryHiddenStateFacet } from './facet.js';

export {
  carryHiddenState,
  inputOf,
  readCarryData,
  type CarryHiddenStateFacetData,
  type CarrySymbols,
} from './algorithm.js';
export { carryHiddenStateScene, type CarryScene, type CarryCell, type CarryStep } from './scene.js';
export { carryHiddenStateStageView } from './carry-hidden-state-stage.js';
export { carryHiddenStateIRs } from './irs.js';
export { carryHiddenStateFacet } from './facet.js';

export function registerCarryHiddenState(): void {
  registerAlgorithm<CarryHiddenStateFacetData>('carryHiddenState', carryHiddenState, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('carryHiddenStateScene', carryHiddenStateScene);
  for (const ir of carryHiddenStateIRs) registerIR(ir.id, ir);
  registerView('carry-hidden-state-stage', carryHiddenStateStageView);
  registerFacets([carryHiddenStateFacet]);
}
