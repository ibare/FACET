import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { countToInfinity, type CountToInfinityFacetData } from './algorithm.js';
import { countToInfinityScene } from './scene.js';
import { countToInfinityIRs } from './irs.js';
import { countToInfinityStageView } from './count-to-infinity-stage.js';
import { countToInfinityFacet } from './facet.js';

export { countToInfinity, converge, type CountToInfinityFacetData } from './algorithm.js';
export {
  countToInfinityScene,
  type CountToInfinityScene,
  type CountBlock,
  type CountMove,
  type CountStep,
} from './scene.js';
export { countToInfinityIRs } from './irs.js';
export { countToInfinityStageView } from './count-to-infinity-stage.js';
export { countToInfinityFacet } from './facet.js';

export function registerCountToInfinity(): void {
  registerAlgorithm<CountToInfinityFacetData>('countToInfinity', countToInfinity, { mechanismKind: 'reactive' });
  registerScenePlan('countToInfinityScene', countToInfinityScene);
  for (const ir of countToInfinityIRs) registerIR(ir.id, ir);
  registerView('count-to-infinity-stage', countToInfinityStageView);
  registerFacets([countToInfinityFacet]);
}
