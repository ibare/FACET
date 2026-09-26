import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { trapdoorWithKey, type TrapdoorWithKeyFacetData } from './algorithm.js';
import { trapdoorWithKeyScene } from './scene.js';
import { trapdoorWithKeyIRs } from './irs.js';
import { trapdoorWithKeyStageView } from './trapdoor-with-key-stage.js';
import { trapdoorWithKeyFacet } from './facet.js';

export { trapdoorWithKey, narrowTrapdoorData, modPow, modInverse } from './algorithm.js';
export type { TrapdoorWithKeyFacetData } from './algorithm.js';
export { trapdoorWithKeyScene } from './scene.js';
export type { TrapdoorScene, TrapdoorLane, TrapdoorKey, TrapdoorStep } from './scene.js';
export { trapdoorWithKeyIRs } from './irs.js';
export { trapdoorWithKeyStageView } from './trapdoor-with-key-stage.js';
export { trapdoorWithKeyFacet } from './facet.js';

export function registerTrapdoorWithKey(): void {
  registerAlgorithm<TrapdoorWithKeyFacetData>('trapdoorWithKey', trapdoorWithKey, { mechanismKind: 'reactive' });
  registerScenePlan('trapdoorWithKeyScene', trapdoorWithKeyScene);
  for (const ir of trapdoorWithKeyIRs) registerIR(ir.id, ir);
  registerView('trapdoor-with-key-stage', trapdoorWithKeyStageView);
  registerFacets([trapdoorWithKeyFacet]);
}
