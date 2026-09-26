import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { addNoiseThenRemove, type AddNoiseThenRemoveFacetData } from './algorithm.js';
import { addNoiseThenRemoveScene } from './scene.js';
import { addNoiseThenRemoveStageView } from './add-noise-then-remove-stage.js';
import { addNoiseThenRemoveIRs } from './irs.js';
import { addNoiseThenRemoveFacet } from './facet.js';

export {
  addNoiseThenRemove,
  narrowAddNoiseThenRemoveData,
  type AddNoiseThenRemoveFacetData,
} from './algorithm.js';
export {
  addNoiseThenRemoveScene,
  type AddNoiseThenRemoveScene,
  type MixState,
  type RevertState,
  type SharePoint,
} from './scene.js';
export { addNoiseThenRemoveStageView } from './add-noise-then-remove-stage.js';
export { addNoiseThenRemoveIRs } from './irs.js';
export { addNoiseThenRemoveFacet } from './facet.js';

export function registerAddNoiseThenRemove(): void {
  registerAlgorithm<AddNoiseThenRemoveFacetData>('addNoiseThenRemove', addNoiseThenRemove, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('addNoiseThenRemoveScene', addNoiseThenRemoveScene);
  for (const ir of addNoiseThenRemoveIRs) registerIR(ir.id, ir);
  registerView('add-noise-then-remove-stage', addNoiseThenRemoveStageView);
  registerFacets([addNoiseThenRemoveFacet]);
}
