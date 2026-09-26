import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { setOfRows, type SetOfRowsFacetData } from './algorithm.js';
import { setOfRowsScene } from './scene.js';
import { setOfRowsIRs } from './irs.js';
import { setOfRowsStageView } from './set-of-rows-stage.js';
import { setOfRowsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './set-of-rows-stage.js';
export * from './facet.js';

export function registerSetOfRows(): void {
  registerAlgorithm<SetOfRowsFacetData>('setOfRows', setOfRows, { mechanismKind: 'reactive' });
  registerScenePlan('setOfRowsScene', setOfRowsScene);
  for (const ir of setOfRowsIRs) registerIR(ir.id, ir);
  registerView('set-of-rows-stage', setOfRowsStageView);
  registerFacets([setOfRowsFacet]);
}
