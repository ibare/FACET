/** 바꾸기와 섞기 조각 — 등록 진입점. */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { substituteAndPermute, type SubstituteAndPermuteFacetData } from './algorithm.js';
import { substituteAndPermuteScene } from './scene.js';
import { substituteAndPermuteStageView } from './substitute-and-permute-stage.js';
import { substituteAndPermuteIRs } from './irs.js';
import { substituteAndPermuteFacet } from './facet.js';

export {
  substituteAndPermute,
  narrowSubstituteAndPermuteData,
  type SubstituteAndPermuteFacetData,
} from './algorithm.js';
export { substituteAndPermuteScene, type SubstituteAndPermuteScene } from './scene.js';
export { substituteAndPermuteStageView } from './substitute-and-permute-stage.js';
export { substituteAndPermuteIRs } from './irs.js';
export { substituteAndPermuteFacet } from './facet.js';

export function registerSubstituteAndPermute(): void {
  registerAlgorithm<SubstituteAndPermuteFacetData>('substituteAndPermute', substituteAndPermute, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('substituteAndPermuteScene', substituteAndPermuteScene);
  for (const ir of substituteAndPermuteIRs) registerIR(ir.id, ir);
  registerView('substitute-and-permute-stage', substituteAndPermuteStageView);
  registerFacets([substituteAndPermuteFacet]);
}
