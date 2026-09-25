import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { instantiateFromClass, type InstantiateFromClassFacetData } from './algorithm.js';
import { instantiateFromClassScene } from './scene.js';
import { instantiateFromClassStageView } from './instantiate-from-class-stage.js';
import { instantiateFromClassIRs } from './irs.js';
import { instantiateFromClassFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './instantiate-from-class-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInstantiateFromClass(): void {
  registerAlgorithm<InstantiateFromClassFacetData>('instantiateFromClass', instantiateFromClass, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('instantiateFromClassScene', instantiateFromClassScene);
  for (const ir of instantiateFromClassIRs) registerIR(ir.id, ir);
  registerView('instantiate-from-class-stage', instantiateFromClassStageView);
  registerFacets([instantiateFromClassFacet]);
}
