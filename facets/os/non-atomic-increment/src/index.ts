import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nonAtomicIncrement, type NonAtomicIncrementFacetData } from './algorithm.js';
import { nonAtomicIncrementScene } from './scene.js';
import { nonAtomicIncrementStageView } from './non-atomic-increment-stage.js';
import { nonAtomicIncrementIRs } from './irs.js';
import { nonAtomicIncrementFacet } from './facet.js';

export { nonAtomicIncrement, type NonAtomicIncrementFacetData } from './algorithm.js';
export {
  nonAtomicIncrementScene,
  type NonAtomicIncrementScene,
  type NonAtomicIncrementStep,
} from './scene.js';
export { nonAtomicIncrementStageView } from './non-atomic-increment-stage.js';
export { nonAtomicIncrementIRs } from './irs.js';
export { nonAtomicIncrementFacet } from './facet.js';

export function registerNonAtomicIncrement(): void {
  registerAlgorithm<NonAtomicIncrementFacetData>('nonAtomicIncrement', nonAtomicIncrement, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('nonAtomicIncrementScene', nonAtomicIncrementScene);
  for (const ir of nonAtomicIncrementIRs) registerIR(ir.id, ir);
  registerView('non-atomic-increment-stage', nonAtomicIncrementStageView);
  registerFacets([nonAtomicIncrementFacet]);
}
