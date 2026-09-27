import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { setOperations, type SetOperationsFacetData } from './algorithm.js';
import { setOperationsFacet } from './facet.js';
import { setOperationsIRs } from './irs.js';
import { setOperationsScene } from './scene.js';
import { setOperationsStageView } from './set-operations-stage.js';

export {
  gatherFor,
  narrowSetOperationsData,
  setOperations,
  SET_OPERATIONS,
  type GatherResult,
  type Origin,
  type SetOperation,
  type SetOperationsFacetData,
} from './algorithm.js';
export {
  setOperationsScene,
  type SetOperationsBase,
  type SetOperationsResult,
  type SetOperationsScene,
  type SetOperationsStep,
} from './scene.js';
export { setOperationsStageView } from './set-operations-stage.js';
export { setOperationsIRs } from './irs.js';
export { setOperationsFacet } from './facet.js';

export function registerSetOperations(): void {
  registerAlgorithm<SetOperationsFacetData>('setOperations', setOperations, { mechanismKind: 'reactive' });
  registerScenePlan('setOperationsScene', setOperationsScene);
  for (const ir of setOperationsIRs) registerIR(ir.id, ir);
  registerView('set-operations-stage', setOperationsStageView);
  registerFacets([setOperationsFacet]);
}
