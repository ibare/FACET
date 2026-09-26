import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { bisectHalving, type BisectHalvingFacetData } from './algorithm.js';
import { bisectHalvingScene } from './scene.js';
import { bisectHalvingStageView } from './bisect-halving-stage.js';
import { bisectHalvingIRs } from './irs.js';
import { bisectHalvingFacet } from './facet.js';

export { bisectHalving, commitIndex, middleOf } from './algorithm.js';
export type { BisectHalvingFacetData, BisectVerdict } from './algorithm.js';
export { bisectHalvingScene } from './scene.js';
export type { BisectHalvingScene, BisectMark, BisectStep } from './scene.js';
export { bisectHalvingStageView } from './bisect-halving-stage.js';
export { bisectHalvingIRs } from './irs.js';
export { bisectHalvingFacet } from './facet.js';

export function registerBisectHalving(): void {
  registerAlgorithm<BisectHalvingFacetData>('bisectHalving', bisectHalving, { mechanismKind: 'reactive' });
  registerScenePlan('bisectHalvingScene', bisectHalvingScene);
  for (const ir of bisectHalvingIRs) registerIR(ir.id, ir);
  registerView('bisect-halving-stage', bisectHalvingStageView);
  registerFacets([bisectHalvingFacet]);
}
