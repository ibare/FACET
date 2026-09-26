import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { collisionAlgorithm, type CollisionData } from './algorithm.js';
import { collisionProjector } from './projector.js';
import { collisionIRs } from './irs.js';
import { collisionStageView } from './collision-stage.js';
import { collisionFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './collision-stage.js';
export * from './facet.js';

/** 손잡이(width)가 있어 reactive 로 등록한다. */
export function registerCollision(): void {
  registerAlgorithm<CollisionData>('collision', collisionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('collisionProjector', collisionProjector);
  for (const ir of collisionIRs) registerIR(ir.id, ir);
  registerView('collision-stage', collisionStageView);
  registerFacets([collisionFacet]);
}
