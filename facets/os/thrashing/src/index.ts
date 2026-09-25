import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { thrashing, type ThrashingFacetData } from './algorithm.js';
import { thrashingScene } from './scene.js';
import { thrashingIRs } from './irs.js';
import { thrashingStageView } from './thrashing-stage.js';
import { thrashingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './thrashing-stage.js';
export * from './facet.js';

export function registerThrashing(): void {
  registerAlgorithm<ThrashingFacetData>('thrashing', thrashing, { mechanismKind: 'reactive' });
  registerScenePlan('thrashingScene', thrashingScene);
  for (const ir of thrashingIRs) registerIR(ir.id, ir);
  registerView('thrashing-stage', thrashingStageView);
  registerFacets([thrashingFacet]);
}
