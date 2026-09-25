import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { collisionAndBackoff, type CollisionAndBackoffFacetData } from './algorithm.js';
import { collisionAndBackoffScene } from './scene.js';
import { collisionAndBackoffStageView } from './collision-and-backoff-stage.js';
import { collisionAndBackoffIRs } from './irs.js';
import { collisionAndBackoffFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './collision-and-backoff-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerCollisionAndBackoff(): void {
  registerAlgorithm<CollisionAndBackoffFacetData>('collisionAndBackoff', collisionAndBackoff, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('collisionAndBackoffScene', collisionAndBackoffScene);
  for (const ir of collisionAndBackoffIRs) registerIR(ir.id, ir);
  registerView('collision-and-backoff-stage', collisionAndBackoffStageView);
  registerFacets([collisionAndBackoffFacet]);
}
