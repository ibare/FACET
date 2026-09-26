import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { independentInParallel, type IndependentInParallelFacetData } from './algorithm.js';
import { independentInParallelScene } from './scene.js';
import { independentInParallelStageView } from './independent-in-parallel-stage.js';
import { independentInParallelIRs } from './irs.js';
import { independentInParallelFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './independent-in-parallel-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerIndependentInParallel(): void {
  registerAlgorithm<IndependentInParallelFacetData>('independentInParallel', independentInParallel, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('independentInParallelScene', independentInParallelScene);
  for (const ir of independentInParallelIRs) registerIR(ir.id, ir);
  registerView('independent-in-parallel-stage', independentInParallelStageView);
  registerFacets([independentInParallelFacet]);
}
