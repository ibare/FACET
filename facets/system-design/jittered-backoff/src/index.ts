import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { jitteredBackoff, type JitteredBackoffFacetData } from './algorithm.js';
import { jitteredBackoffScene } from './scene.js';
import { jitteredBackoffStageView } from './jittered-backoff-stage.js';
import { jitteredBackoffIRs } from './irs.js';
import { jitteredBackoffFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { jitteredBackoffStageView } from './jittered-backoff-stage.js';
export { jitteredBackoffIRs } from './irs.js';
export { jitteredBackoffFacet } from './facet.js';

export function registerJitteredBackoff(): void {
  registerAlgorithm<JitteredBackoffFacetData>('jitteredBackoff', jitteredBackoff, { mechanismKind: 'reactive' });
  registerScenePlan('jitteredBackoffScene', jitteredBackoffScene);
  for (const ir of jitteredBackoffIRs) registerIR(ir.id, ir);
  registerView('jittered-backoff-stage', jitteredBackoffStageView);
  registerFacets([jitteredBackoffFacet]);
}
