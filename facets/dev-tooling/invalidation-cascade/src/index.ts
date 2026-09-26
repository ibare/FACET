import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { invalidationCascade, type InvalidationCascadeFacetData } from './algorithm.js';
import { invalidationCascadeScene } from './scene.js';
import { invalidationCascadeStageView } from './invalidation-cascade-stage.js';
import { invalidationCascadeIRs } from './irs.js';
import { invalidationCascadeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './invalidation-cascade-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInvalidationCascade(): void {
  registerAlgorithm<InvalidationCascadeFacetData>('invalidationCascade', invalidationCascade, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('invalidationCascadeScene', invalidationCascadeScene);
  for (const ir of invalidationCascadeIRs) registerIR(ir.id, ir);
  registerView('invalidation-cascade-stage', invalidationCascadeStageView);
  registerFacets([invalidationCascadeFacet]);
}
