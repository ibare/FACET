import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { oneGrowsRestShift, type OneGrowsRestShiftFacetData } from './algorithm.js';
import { oneGrowsRestShiftScene } from './scene.js';
import { oneGrowsRestShiftIRs } from './irs.js';
import { oneGrowsRestShiftStageView } from './one-grows-rest-shift-stage.js';
import { oneGrowsRestShiftFacet } from './facet.js';

export { oneGrowsRestShift, oneGrowsRestShiftScene, oneGrowsRestShiftIRs, oneGrowsRestShiftStageView, oneGrowsRestShiftFacet };
export type { OneGrowsRestShiftFacetData, OneGrowsRestShiftBlock } from './algorithm.js';
export type { OneGrowsRestShiftScene, OneGrowsRestShiftSceneBlock, OneGrowsRestShiftStep } from './scene.js';

export function registerOneGrowsRestShift(): void {
  registerAlgorithm<OneGrowsRestShiftFacetData>('oneGrowsRestShift', oneGrowsRestShift, { mechanismKind: 'reactive' });
  registerScenePlan('oneGrowsRestShiftScene', oneGrowsRestShiftScene);
  for (const ir of oneGrowsRestShiftIRs) registerIR(ir.id, ir);
  registerView('one-grows-rest-shift-stage', oneGrowsRestShiftStageView);
  registerFacets([oneGrowsRestShiftFacet]);
}
