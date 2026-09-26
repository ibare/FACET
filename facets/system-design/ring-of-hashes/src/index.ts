import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { ringOfHashes, type RingOfHashesFacetData } from './algorithm.js';
import { ringOfHashesScene } from './scene.js';
import { ringOfHashesStageView } from './ring-of-hashes-stage.js';
import { ringOfHashesIRs } from './irs.js';
import { ringOfHashesFacet } from './facet.js';

export { ringOfHashes, readRingData, h32, ringPos, ringOwner, type RingOfHashesFacetData } from './algorithm.js';
export { ringOfHashesScene, type RingScene, type RingStep, type KeySeat } from './scene.js';
export { ringOfHashesStageView } from './ring-of-hashes-stage.js';
export { ringOfHashesIRs } from './irs.js';
export { ringOfHashesFacet } from './facet.js';

export function registerRingOfHashes(): void {
  registerAlgorithm<RingOfHashesFacetData>('ringOfHashes', ringOfHashes, { mechanismKind: 'reactive' });
  registerScenePlan('ringOfHashesScene', ringOfHashesScene);
  for (const ir of ringOfHashesIRs) registerIR(ir.id, ir);
  registerView('ring-of-hashes-stage', ringOfHashesStageView);
  registerFacets([ringOfHashesFacet]);
}
