import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { stateTransitions, type StateTransitionsFacetData } from './algorithm.js';
import { stateTransitionsScene } from './scene.js';
import { stateTransitionsIRs } from './irs.js';
import { stateTransitionsStageView } from './state-transitions-stage.js';
import { stateTransitionsFacet } from './facet.js';

export { stateTransitions, type StateTransitionsFacetData, type StateTransitionRow } from './algorithm.js';
export { stateTransitionsScene, waysOut, type StateTransitionsScene, type StateEdge } from './scene.js';
export { stateTransitionsIRs } from './irs.js';
export { stateTransitionsStageView } from './state-transitions-stage.js';
export { stateTransitionsFacet } from './facet.js';

export function registerStateTransitions(): void {
  registerAlgorithm<StateTransitionsFacetData>('stateTransitions', stateTransitions, { mechanismKind: 'reactive' });
  registerScenePlan('stateTransitionsScene', stateTransitionsScene);
  for (const ir of stateTransitionsIRs) registerIR(ir.id, ir);
  registerView('state-transitions-stage', stateTransitionsStageView);
  registerFacets([stateTransitionsFacet]);
}
