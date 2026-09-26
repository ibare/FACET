import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fourBoxes, type FourBoxesFacetData } from './algorithm.js';
import { fourBoxesScene } from './scene.js';
import { fourBoxesStageView } from './four-boxes-stage.js';
import { fourBoxesIRs } from './irs.js';
import { fourBoxesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './four-boxes-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFourBoxes(): void {
  registerAlgorithm<FourBoxesFacetData>('fourBoxes', fourBoxes, { mechanismKind: 'reactive' });
  registerScenePlan('fourBoxesScene', fourBoxesScene);
  for (const ir of fourBoxesIRs) registerIR(ir.id, ir);
  registerView('four-boxes-stage', fourBoxesStageView);
  registerFacets([fourBoxesFacet]);
}
