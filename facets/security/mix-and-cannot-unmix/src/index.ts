import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { mixAndCannotUnmix, type MixAndCannotUnmixFacetData } from './algorithm.js';
import { mixAndCannotUnmixScene } from './scene.js';
import { mixAndCannotUnmixStageView } from './mix-and-cannot-unmix-stage.js';
import { mixAndCannotUnmixIRs } from './irs.js';
import { mixAndCannotUnmixFacet } from './facet.js';

export { mixAndCannotUnmix, narrowMixData, modPow } from './algorithm.js';
export type { MixAndCannotUnmixFacetData, Direction, MixSummary } from './algorithm.js';
export { mixAndCannotUnmixScene } from './scene.js';
export type { MixScene, MixVisit } from './scene.js';
export { mixAndCannotUnmixStageView } from './mix-and-cannot-unmix-stage.js';
export { mixAndCannotUnmixIRs } from './irs.js';
export { mixAndCannotUnmixFacet } from './facet.js';

export function registerMixAndCannotUnmix(): void {
  registerAlgorithm<MixAndCannotUnmixFacetData>('mixAndCannotUnmix', mixAndCannotUnmix, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('mixAndCannotUnmixScene', mixAndCannotUnmixScene);
  for (const ir of mixAndCannotUnmixIRs) registerIR(ir.id, ir);
  registerView('mix-and-cannot-unmix-stage', mixAndCannotUnmixStageView);
  registerFacets([mixAndCannotUnmixFacet]);
}
