import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { threeWaySync, type ThreeWaySyncFacetData } from './algorithm.js';
import { threeWaySyncScene } from './scene.js';
import { threeWaySyncStageView } from './three-way-sync-stage.js';
import { threeWaySyncIRs } from './irs.js';
import { threeWaySyncFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './three-way-sync-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerThreeWaySync(): void {
  registerAlgorithm<ThreeWaySyncFacetData>('threeWaySync', threeWaySync, { mechanismKind: 'reactive' });
  registerScenePlan('threeWaySyncScene', threeWaySyncScene);
  for (const ir of threeWaySyncIRs) registerIR(ir.id, ir);
  registerView('three-way-sync-stage', threeWaySyncStageView);
  registerFacets([threeWaySyncFacet]);
}
