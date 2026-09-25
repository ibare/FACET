import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { dynamicDispatch, type DynamicDispatchFacetData } from './algorithm.js';
import { dynamicDispatchStageView } from './dynamic-dispatch-stage.js';
import { dynamicDispatchFacet } from './facet.js';
import { dynamicDispatchIRs } from './irs.js';
import { dynamicDispatchScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export { dynamicDispatchStageView } from './dynamic-dispatch-stage.js';
export { dynamicDispatchIRs } from './irs.js';
export { dynamicDispatchFacet } from './facet.js';

export function registerDynamicDispatch(): void {
  registerAlgorithm<DynamicDispatchFacetData>('dynamicDispatch', dynamicDispatch, { mechanismKind: 'reactive' });
  registerScenePlan('dynamicDispatchScene', dynamicDispatchScene);
  for (const ir of dynamicDispatchIRs) registerIR(ir.id, ir);
  registerView('dynamic-dispatch-stage', dynamicDispatchStageView);
  registerFacets([dynamicDispatchFacet]);
}
