import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { permutationVsCombination, type PermutationVsCombinationFacetData } from './algorithm.js';
import { permutationVsCombinationScene } from './scene.js';
import { permutationVsCombinationStageView } from './permutation-vs-combination-stage.js';
import { permutationVsCombinationIRs } from './irs.js';
import { permutationVsCombinationFacet } from './facet.js';

export {
  permutationVsCombination,
  arrangementsOf,
  combinationsOf,
  narrowPermutationVsCombinationData,
  type PermutationVsCombinationFacetData,
} from './algorithm.js';
export {
  permutationVsCombinationScene,
  type PermutationVsCombinationScene,
  type PvcGroup,
  type PvcLaid,
  type PvcStep,
} from './scene.js';
export { permutationVsCombinationStageView } from './permutation-vs-combination-stage.js';
export { permutationVsCombinationIRs } from './irs.js';
export { permutationVsCombinationFacet } from './facet.js';

export function registerPermutationVsCombination(): void {
  registerAlgorithm<PermutationVsCombinationFacetData>('permutationVsCombination', permutationVsCombination, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('permutationVsCombinationScene', permutationVsCombinationScene);
  for (const ir of permutationVsCombinationIRs) registerIR(ir.id, ir);
  registerView('permutation-vs-combination-stage', permutationVsCombinationStageView);
  registerFacets([permutationVsCombinationFacet]);
}
