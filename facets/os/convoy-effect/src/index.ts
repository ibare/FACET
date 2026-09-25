import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { convoyEffect, type ConvoyEffectFacetData } from './algorithm.js';
import { convoyEffectScene } from './scene.js';
import { convoyEffectIRs } from './irs.js';
import { convoyEffectStageView } from './convoy-effect-stage.js';
import { convoyEffectFacet } from './facet.js';

export { convoyEffect, readConvoyJobs } from './algorithm.js';
export type { ConvoyEffectFacetData, ConvoyJob } from './algorithm.js';
export { convoyEffectScene, followersWaited } from './scene.js';
export type { ConvoyScene, ConvoyStep } from './scene.js';
export { convoyEffectIRs } from './irs.js';
export { convoyEffectStageView } from './convoy-effect-stage.js';
export { convoyEffectFacet } from './facet.js';

export function registerConvoyEffect(): void {
  registerAlgorithm<ConvoyEffectFacetData>('convoyEffect', convoyEffect, { mechanismKind: 'reactive' });
  registerScenePlan('convoyEffectScene', convoyEffectScene);
  for (const ir of convoyEffectIRs) registerIR(ir.id, ir);
  registerView('convoy-effect-stage', convoyEffectStageView);
  registerFacets([convoyEffectFacet]);
}
