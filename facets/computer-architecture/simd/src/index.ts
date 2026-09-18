import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { simdAlgorithm, type SimdData } from './algorithm.js';
import { simdProjector } from './projector.js';
import { simdIRs } from './irs.js';
import { simdStageView } from './simd-stage.js';
import { simdFacet } from './facet.js';

export { simdAlgorithm, speedupPercentOf, type SimdData } from './algorithm.js';
export { simdProjector } from './projector.js';
export { simdImperativeIR, simdIRs } from './irs.js';
export { simdStageView, type SimdStage } from './simd-stage.js';
export { simdFacet } from './facet.js';

export function registerSimd(): void {
  registerAlgorithm<SimdData>('simd', simdAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('simdProjector', simdProjector);
  for (const ir of simdIRs) registerIR(ir.id, ir);
  registerView('simd-stage', simdStageView);
  registerFacets([simdFacet]);
}
