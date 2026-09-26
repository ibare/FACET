import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shrinkToSmallest, type ShrinkToSmallestFacetData } from './algorithm.js';
import { shrinkToSmallestScene } from './scene.js';
import { shrinkToSmallestStageView } from './shrink-to-smallest-stage.js';
import { shrinkToSmallestIRs } from './irs.js';
import { shrinkToSmallestFacet } from './facet.js';

export {
  shrinkToSmallest,
  breaksProperty,
  decodeText,
  encodeList,
  valueCandidates,
  readShrinkData,
  type ShrinkToSmallestFacetData,
} from './algorithm.js';
export { shrinkToSmallestScene, type ShrinkScene, type ShrinkStep, type TriedEntry } from './scene.js';
export { shrinkToSmallestStageView } from './shrink-to-smallest-stage.js';
export { shrinkToSmallestIRs } from './irs.js';
export { shrinkToSmallestFacet } from './facet.js';

export function registerShrinkToSmallest(): void {
  registerAlgorithm<ShrinkToSmallestFacetData>('shrinkToSmallest', shrinkToSmallest, { mechanismKind: 'reactive' });
  registerScenePlan('shrinkToSmallestScene', shrinkToSmallestScene);
  for (const ir of shrinkToSmallestIRs) registerIR(ir.id, ir);
  registerView('shrink-to-smallest-stage', shrinkToSmallestStageView);
  registerFacets([shrinkToSmallestFacet]);
}
