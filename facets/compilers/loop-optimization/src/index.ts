import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { loopOptimizationAlgorithm, type LoopOptimizationData } from './algorithm.js';
import { loopOptimizationFacet } from './facet.js';
import { loopOptimizationIRs } from './irs.js';
import { loopOptimizationProjector } from './projector.js';
import { loopOptimizationStageView } from './loop-optimization-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './loop-optimization-stage.js';

/** loop-optimization 을 레지스트리에 올린다. 손잡이가 있어 reactive 다. */
export function registerLoopOptimization(): void {
  registerAlgorithm<LoopOptimizationData>('loopOptimization', loopOptimizationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('loopOptimizationProjector', loopOptimizationProjector);
  for (const ir of loopOptimizationIRs) registerIR(ir.id, ir);
  registerView('loop-optimization-stage', loopOptimizationStageView);
  registerFacets([loopOptimizationFacet]);
}
