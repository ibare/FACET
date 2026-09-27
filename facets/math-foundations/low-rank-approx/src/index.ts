import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lowRankApprox, type LowRankApproxFacetData } from './algorithm.js';
import { lowRankApproxScene } from './scene.js';
import { lowRankApproxIRs } from './irs.js';
import { lowRankApproxStageView } from './low-rank-approx-stage.js';
import { lowRankApproxFacet } from './facet.js';

export { lowRankApprox, narrowLowRankApproxData, decompose, type LowRankApproxFacetData } from './algorithm.js';
export { lowRankApproxScene, type LowRankScene, type LowRankStep, type LowRankBase } from './scene.js';
export { lowRankApproxIRs } from './irs.js';
export { lowRankApproxStageView } from './low-rank-approx-stage.js';
export { lowRankApproxFacet } from './facet.js';

export function registerLowRankApprox(): void {
  registerAlgorithm<LowRankApproxFacetData>('lowRankApprox', lowRankApprox, { mechanismKind: 'reactive' });
  registerScenePlan('lowRankApproxScene', lowRankApproxScene);
  for (const ir of lowRankApproxIRs) registerIR(ir.id, ir);
  registerView('low-rank-approx-stage', lowRankApproxStageView);
  registerFacets([lowRankApproxFacet]);
}
