import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { roundKeyMix, type RoundKeyMixFacetData } from './algorithm.js';
import { roundKeyMixScene } from './scene.js';
import { roundKeyMixIRs } from './irs.js';
import { roundKeyMixStageView } from './round-key-mix-stage.js';
import { roundKeyMixFacet } from './facet.js';

export { roundKeyMix, narrowRoundKeyMixData, hexToBits, keyStart } from './algorithm.js';
export type { RoundKeyMixFacetData, MixPayload, PassKind } from './algorithm.js';
export { roundKeyMixScene } from './scene.js';
export type { RoundKeyMixScene, CutKey } from './scene.js';
export { roundKeyMixIRs } from './irs.js';
export { roundKeyMixStageView } from './round-key-mix-stage.js';
export { roundKeyMixFacet } from './facet.js';

export function registerRoundKeyMix(): void {
  registerAlgorithm<RoundKeyMixFacetData>('roundKeyMix', roundKeyMix, { mechanismKind: 'reactive' });
  registerScenePlan('roundKeyMixScene', roundKeyMixScene);
  for (const ir of roundKeyMixIRs) registerIR(ir.id, ir);
  registerView('round-key-mix-stage', roundKeyMixStageView);
  registerFacets([roundKeyMixFacet]);
}
