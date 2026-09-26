import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { stateEatsChar, type StateEatsCharFacetData } from './algorithm.js';
import { stateEatsCharScene } from './scene.js';
import { stateEatsCharIRs } from './irs.js';
import { stateEatsCharStageView } from './state-eats-char-stage.js';
import { stateEatsCharFacet } from './facet.js';

export {
  stateEatsChar,
  narrowStateEatsCharData,
  edgesOut,
  transition,
  type StateEatsCharFacetData,
  type MachineEdge,
  type AcceptMark,
} from './algorithm.js';
export { stateEatsCharScene, type StateEatsCharScene, type EatStep } from './scene.js';
export { stateEatsCharIRs } from './irs.js';
export { stateEatsCharStageView } from './state-eats-char-stage.js';
export { stateEatsCharFacet } from './facet.js';

export function registerStateEatsChar(): void {
  registerAlgorithm<StateEatsCharFacetData>('stateEatsChar', stateEatsChar, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('stateEatsCharScene', stateEatsCharScene);
  for (const ir of stateEatsCharIRs) registerIR(ir.id, ir);
  registerView('state-eats-char-stage', stateEatsCharStageView);
  registerFacets([stateEatsCharFacet]);
}
