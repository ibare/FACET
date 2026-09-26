import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shrinkAll, type ShrinkAllFacetData } from './algorithm.js';
import { shrinkAllScene } from './scene.js';
import { shrinkAllStageView } from './shrink-all-stage.js';
import { shrinkAllIRs } from './irs.js';
import { shrinkAllFacet } from './facet.js';

export { shrinkAll, narrowShrinkAllData, type ShrinkAllFacetData, type Pair } from './algorithm.js';
export { shrinkAllScene, type ShrinkAllScene, type ShrinkAllStep } from './scene.js';
export { shrinkAllStageView } from './shrink-all-stage.js';
export { shrinkAllIRs } from './irs.js';
export { shrinkAllFacet } from './facet.js';

export function registerShrinkAll(): void {
  registerAlgorithm<ShrinkAllFacetData>('shrinkAll', shrinkAll, { mechanismKind: 'reactive' });
  registerScenePlan('shrinkAllScene', shrinkAllScene);
  for (const ir of shrinkAllIRs) registerIR(ir.id, ir);
  registerView('shrink-all-stage', shrinkAllStageView);
  registerFacets([shrinkAllFacet]);
}
