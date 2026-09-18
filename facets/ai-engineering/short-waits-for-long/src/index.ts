import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shortWaitsForLong, type ShortWaitsForLongFacetData } from './algorithm.js';
import { shortWaitsForLongScene } from './scene.js';
import { shortWaitsForLongIRs } from './irs.js';
import { shortWaitsForLongStageView } from './short-waits-for-long-stage.js';
import { shortWaitsForLongFacet } from './facet.js';

export { shortWaitsForLong, type ShortWaitsForLongFacetData } from './algorithm.js';
export {
  shortWaitsForLongScene,
  type ShortWaitsForLongScene,
  type ShortWaitsStep,
  type BatchRequest,
} from './scene.js';
export { shortWaitsForLongIRs } from './irs.js';
export { shortWaitsForLongStageView } from './short-waits-for-long-stage.js';
export { shortWaitsForLongFacet } from './facet.js';

export function registerShortWaitsForLong(): void {
  registerAlgorithm<ShortWaitsForLongFacetData>('shortWaitsForLong', shortWaitsForLong, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('shortWaitsForLongScene', shortWaitsForLongScene);
  for (const ir of shortWaitsForLongIRs) registerIR(ir.id, ir);
  registerView('short-waits-for-long-stage', shortWaitsForLongStageView);
  registerFacets([shortWaitsForLongFacet]);
}
