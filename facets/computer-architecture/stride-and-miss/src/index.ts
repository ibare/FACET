import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { strideAndMiss, type StrideAndMissFacetData } from './algorithm.js';
import { strideAndMissScene } from './scene.js';
import { strideAndMissIRs } from './irs.js';
import { strideAndMissStageView } from './stride-and-miss-stage.js';
import { strideAndMissFacet } from './facet.js';

export { strideAndMiss, type StrideAndMissFacetData } from './algorithm.js';
export {
  strideAndMissScene,
  type StrideAndMissScene,
  type StrideBase,
  type StrideCache,
  type LedgerRow,
  type StrideStep,
} from './scene.js';
export { strideAndMissIRs } from './irs.js';
export { strideAndMissStageView } from './stride-and-miss-stage.js';
export { strideAndMissFacet } from './facet.js';

export function registerStrideAndMiss(): void {
  registerAlgorithm<StrideAndMissFacetData>('strideAndMiss', strideAndMiss, { mechanismKind: 'reactive' });
  registerScenePlan('strideAndMissScene', strideAndMissScene);
  for (const ir of strideAndMissIRs) registerIR(ir.id, ir);
  registerView('stride-and-miss-stage', strideAndMissStageView);
  registerFacets([strideAndMissFacet]);
}
