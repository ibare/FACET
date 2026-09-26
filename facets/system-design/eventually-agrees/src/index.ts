import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { eventuallyAgrees, type EventuallyAgreesFacetData } from './algorithm.js';
import { eventuallyAgreesScene } from './scene.js';
import { eventuallyAgreesStageView } from './eventually-agrees-stage.js';
import { eventuallyAgreesIRs } from './irs.js';
import { eventuallyAgreesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { eventuallyAgreesStageView } from './eventually-agrees-stage.js';
export { eventuallyAgreesIRs } from './irs.js';
export { eventuallyAgreesFacet } from './facet.js';

export function registerEventuallyAgrees(): void {
  registerAlgorithm<EventuallyAgreesFacetData>('eventuallyAgrees', eventuallyAgrees, { mechanismKind: 'reactive' });
  registerScenePlan('eventuallyAgreesScene', eventuallyAgreesScene);
  for (const ir of eventuallyAgreesIRs) registerIR(ir.id, ir);
  registerView('eventually-agrees-stage', eventuallyAgreesStageView);
  registerFacets([eventuallyAgreesFacet]);
}
