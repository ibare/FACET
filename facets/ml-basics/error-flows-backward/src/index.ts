import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { errorFlowsBackward, type ErrorFlowsBackwardFacetData } from './algorithm.js';
import { errorFlowsBackwardScene } from './scene.js';
import { errorFlowsBackwardStageView } from './error-flows-backward-stage.js';
import { errorFlowsBackwardIRs } from './irs.js';
import { errorFlowsBackwardFacet } from './facet.js';

export { errorFlowsBackward, readErrorFlowsData, type ErrorFlowsBackwardFacetData } from './algorithm.js';
export { errorFlowsBackwardScene, type ErrorFlowsBackwardScene } from './scene.js';
export { errorFlowsBackwardStageView } from './error-flows-backward-stage.js';
export { errorFlowsBackwardIRs } from './irs.js';
export { errorFlowsBackwardFacet } from './facet.js';

export function registerErrorFlowsBackward(): void {
  registerAlgorithm<ErrorFlowsBackwardFacetData>('errorFlowsBackward', errorFlowsBackward, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('errorFlowsBackwardScene', errorFlowsBackwardScene);
  for (const ir of errorFlowsBackwardIRs) registerIR(ir.id, ir);
  registerView('error-flows-backward-stage', errorFlowsBackwardStageView);
  registerFacets([errorFlowsBackwardFacet]);
}
