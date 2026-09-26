import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { leftmostPrefix, type LeftmostPrefixFacetData } from './algorithm.js';
import { leftmostPrefixScene } from './scene.js';
import { leftmostPrefixIRs } from './irs.js';
import { leftmostPrefixStageView } from './leftmost-prefix-stage.js';
import { leftmostPrefixFacet } from './facet.js';

export { leftmostPrefix, type LeftmostPrefixFacetData } from './algorithm.js';
export { leftmostPrefixScene, type LeftmostPrefixScene } from './scene.js';
export { leftmostPrefixIRs } from './irs.js';
export { leftmostPrefixStageView } from './leftmost-prefix-stage.js';
export { leftmostPrefixFacet } from './facet.js';

export function registerLeftmostPrefix(): void {
  registerAlgorithm<LeftmostPrefixFacetData>('leftmostPrefix', leftmostPrefix, { mechanismKind: 'reactive' });
  registerScenePlan('leftmostPrefixScene', leftmostPrefixScene);
  for (const ir of leftmostPrefixIRs) registerIR(ir.id, ir);
  registerView('leftmost-prefix-stage', leftmostPrefixStageView);
  registerFacets([leftmostPrefixFacet]);
}
