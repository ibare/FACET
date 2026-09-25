import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { swapInOut, type SwapInOutFacetData } from './algorithm.js';
import { swapInOutScene } from './scene.js';
import { swapInOutIRs } from './irs.js';
import { swapInOutStageView } from './swap-in-out-stage.js';
import { swapInOutFacet } from './facet.js';

export { swapInOut, readSwapData } from './algorithm.js';
export type { SwapInOutFacetData, ProcState, SwapJob, SwapStart } from './algorithm.js';
export { swapInOutScene } from './scene.js';
export type { SwapScene, SwapStep } from './scene.js';
export { swapInOutIRs } from './irs.js';
export { swapInOutStageView } from './swap-in-out-stage.js';
export { swapInOutFacet } from './facet.js';

export function registerSwapInOut(): void {
  registerAlgorithm<SwapInOutFacetData>('swapInOut', swapInOut, { mechanismKind: 'reactive' });
  registerScenePlan('swapInOutScene', swapInOutScene);
  for (const ir of swapInOutIRs) registerIR(ir.id, ir);
  registerView('swap-in-out-stage', swapInOutStageView);
  registerFacets([swapInOutFacet]);
}
