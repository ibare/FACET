import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { storeAndForward, type StoreAndForwardFacetData } from './algorithm.js';
import { storeAndForwardScene } from './scene.js';
import { storeAndForwardStageView } from './store-and-forward-stage.js';
import { storeAndForwardIRs } from './irs.js';
import { storeAndForwardFacet } from './facet.js';

export { storeAndForward, type StoreAndForwardFacetData } from './algorithm.js';
export {
  storeAndForwardScene,
  type StoreAndForwardScene,
  type StoreAndForwardBase,
  type StoreAndForwardStep,
  type Custody,
  type Link,
  type Place,
} from './scene.js';
export { storeAndForwardStageView } from './store-and-forward-stage.js';
export { storeAndForwardIRs } from './irs.js';
export { storeAndForwardFacet } from './facet.js';

export function registerStoreAndForward(): void {
  registerAlgorithm<StoreAndForwardFacetData>('storeAndForward', storeAndForward, { mechanismKind: 'reactive' });
  registerScenePlan('storeAndForwardScene', storeAndForwardScene);
  for (const ir of storeAndForwardIRs) registerIR(ir.id, ir);
  registerView('store-and-forward-stage', storeAndForwardStageView);
  registerFacets([storeAndForwardFacet]);
}
