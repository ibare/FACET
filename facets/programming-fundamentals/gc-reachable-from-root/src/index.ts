import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { gcReachableFromRoot, type GcReachableFromRootFacetData } from './algorithm.js';
import { gcReachableFromRootScene } from './scene.js';
import { gcReachableFromRootStageView } from './gc-reachable-from-root-stage.js';
import { gcReachableFromRootIRs } from './irs.js';
import { gcReachableFromRootFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './gc-reachable-from-root-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerGcReachableFromRoot(): void {
  registerAlgorithm<GcReachableFromRootFacetData>('gcReachableFromRoot', gcReachableFromRoot, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('gcReachableFromRootScene', gcReachableFromRootScene);
  for (const ir of gcReachableFromRootIRs) registerIR(ir.id, ir);
  registerView('gc-reachable-from-root-stage', gcReachableFromRootStageView);
  registerFacets([gcReachableFromRootFacet]);
}
