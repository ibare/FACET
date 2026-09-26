import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { valueOfAction, type ValueOfActionFacetData } from './algorithm.js';
import { valueOfActionScene } from './scene.js';
import { valueOfActionIRs } from './irs.js';
import { valueOfActionStageView } from './value-of-action-stage.js';
import { valueOfActionFacet } from './facet.js';

export { valueOfAction, readValueOfActionData, valueStates, bestIndex } from './algorithm.js';
export type { ValueOfActionFacetData } from './algorithm.js';
export { valueOfActionScene } from './scene.js';
export type { ValueOfActionScene, ValueOfActionUpdate } from './scene.js';
export { valueOfActionIRs } from './irs.js';
export { valueOfActionStageView } from './value-of-action-stage.js';
export { valueOfActionFacet } from './facet.js';

export function registerValueOfAction(): void {
  registerAlgorithm<ValueOfActionFacetData>('valueOfAction', valueOfAction, { mechanismKind: 'reactive' });
  registerScenePlan('valueOfActionScene', valueOfActionScene);
  for (const ir of valueOfActionIRs) registerIR(ir.id, ir);
  registerView('value-of-action-stage', valueOfActionStageView);
  registerFacets([valueOfActionFacet]);
}
