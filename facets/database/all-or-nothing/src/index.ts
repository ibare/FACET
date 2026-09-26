import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { allOrNothing, type AllOrNothingFacetData } from './algorithm.js';
import { allOrNothingScene } from './scene.js';
import { allOrNothingStageView } from './all-or-nothing-stage.js';
import { allOrNothingIRs } from './irs.js';
import { allOrNothingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './all-or-nothing-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerAllOrNothing(): void {
  registerAlgorithm<AllOrNothingFacetData>('allOrNothing', allOrNothing, { mechanismKind: 'reactive' });
  registerScenePlan('allOrNothingScene', allOrNothingScene);
  for (const ir of allOrNothingIRs) registerIR(ir.id, ir);
  registerView('all-or-nothing-stage', allOrNothingStageView);
  registerFacets([allOrNothingFacet]);
}
