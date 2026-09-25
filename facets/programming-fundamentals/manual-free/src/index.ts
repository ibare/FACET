import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { manualFree, type ManualFreeFacetData } from './algorithm.js';
import { manualFreeScene } from './scene.js';
import { manualFreeIRs } from './irs.js';
import { manualFreeStageView } from './manual-free-stage.js';
import { manualFreeFacet } from './facet.js';

export { manualFree, traceManualFree, type ManualFreeFacetData } from './algorithm.js';
export { manualFreeScene, type ManualFreeScene } from './scene.js';
export { manualFreeIRs } from './irs.js';
export { manualFreeStageView } from './manual-free-stage.js';
export { manualFreeFacet } from './facet.js';

export function registerManualFree(): void {
  registerAlgorithm<ManualFreeFacetData>('manualFree', manualFree, { mechanismKind: 'reactive' });
  registerScenePlan('manualFreeScene', manualFreeScene);
  for (const ir of manualFreeIRs) registerIR(ir.id, ir);
  registerView('manual-free-stage', manualFreeStageView);
  registerFacets([manualFreeFacet]);
}
