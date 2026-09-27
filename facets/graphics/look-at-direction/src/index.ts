import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lookAtDirection, type LookAtDirectionFacetData } from './algorithm.js';
import { lookAtDirectionScene } from './scene.js';
import { lookAtDirectionStageView } from './look-at-direction-stage.js';
import { lookAtDirectionIRs } from './irs.js';
import { lookAtDirectionFacet } from './facet.js';

export { lookAtDirection, narrowLookAtData, type LookAtDirectionFacetData, type Vec3 } from './algorithm.js';
export { lookAtDirectionScene, type LookAtDirectionScene } from './scene.js';
export { lookAtDirectionStageView } from './look-at-direction-stage.js';
export { lookAtDirectionIRs } from './irs.js';
export { lookAtDirectionFacet } from './facet.js';

export function registerLookAtDirection(): void {
  registerAlgorithm<LookAtDirectionFacetData>('lookAtDirection', lookAtDirection, { mechanismKind: 'reactive' });
  registerScenePlan('lookAtDirectionScene', lookAtDirectionScene);
  for (const ir of lookAtDirectionIRs) registerIR(ir.id, ir);
  registerView('look-at-direction-stage', lookAtDirectionStageView);
  registerFacets([lookAtDirectionFacet]);
}
