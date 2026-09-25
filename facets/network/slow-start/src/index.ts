import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { slowStart, type SlowStartFacetData } from './algorithm.js';
import { slowStartScene } from './scene.js';
import { slowStartIRs } from './irs.js';
import { slowStartStageView } from './slow-start-stage.js';
import { slowStartFacet } from './facet.js';

export { slowStart, type SlowStartFacetData } from './algorithm.js';
export { slowStartScene, type SlowStartScene, type SlowStartRound, type SlowStartStep } from './scene.js';
export { slowStartIRs } from './irs.js';
export { slowStartStageView } from './slow-start-stage.js';
export { slowStartFacet } from './facet.js';

export function registerSlowStart(): void {
  registerAlgorithm<SlowStartFacetData>('slowStart', slowStart, { mechanismKind: 'reactive' });
  registerScenePlan('slowStartScene', slowStartScene);
  for (const ir of slowStartIRs) registerIR(ir.id, ir);
  registerView('slow-start-stage', slowStartStageView);
  registerFacets([slowStartFacet]);
}
