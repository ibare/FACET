import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { returnToCaller, type ReturnToCallerFacetData } from './algorithm.js';
import { returnToCallerScene } from './scene.js';
import { returnToCallerIRs } from './irs.js';
import { returnToCallerStageView } from './return-to-caller-stage.js';
import { returnToCallerFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { returnToCallerIRs } from './irs.js';
export { returnToCallerStageView } from './return-to-caller-stage.js';
export { returnToCallerFacet } from './facet.js';

export function registerReturnToCaller(): void {
  registerAlgorithm<ReturnToCallerFacetData>('returnToCaller', returnToCaller, { mechanismKind: 'reactive' });
  registerScenePlan('returnToCallerScene', returnToCallerScene);
  for (const ir of returnToCallerIRs) registerIR(ir.id, ir);
  registerView('return-to-caller-stage', returnToCallerStageView);
  registerFacets([returnToCallerFacet]);
}
