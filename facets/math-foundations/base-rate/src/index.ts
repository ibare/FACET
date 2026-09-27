import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { baseRate, type BaseRateFacetData } from './algorithm.js';
import { baseRateScene } from './scene.js';
import { baseRateStageView } from './base-rate-stage.js';
import { baseRateIRs } from './irs.js';
import { baseRateFacet } from './facet.js';

export {
  baseRate,
  expectedCounts,
  narrowBaseRateData,
  type BaseRateCounts,
  type BaseRateFacetData,
  type BaseRateGroupData,
} from './algorithm.js';
export { baseRateScene, type BaseRateGroupScene, type BaseRatePhase, type BaseRateScene } from './scene.js';
export { baseRateStageView } from './base-rate-stage.js';
export { baseRateIRs } from './irs.js';
export { baseRateFacet } from './facet.js';

export function registerBaseRate(): void {
  registerAlgorithm<BaseRateFacetData>('baseRate', baseRate, { mechanismKind: 'reactive' });
  registerScenePlan('baseRateScene', baseRateScene);
  for (const ir of baseRateIRs) registerIR(ir.id, ir);
  registerView('base-rate-stage', baseRateStageView);
  registerFacets([baseRateFacet]);
}
