import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { loopTermination, type LoopTerminationFacetData } from './algorithm.js';
import { loopTerminationScene } from './scene.js';
import { loopTerminationStageView } from './loop-termination-stage.js';
import { loopTerminationIRs } from './irs.js';
import { loopTerminationFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './loop-termination-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerLoopTermination(): void {
  registerAlgorithm<LoopTerminationFacetData>('loopTermination', loopTermination, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('loopTerminationScene', loopTerminationScene);
  for (const ir of loopTerminationIRs) registerIR(ir.id, ir);
  registerView('loop-termination-stage', loopTerminationStageView);
  registerFacets([loopTerminationFacet]);
}
