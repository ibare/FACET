import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { allPairs, type AllPairsFacetData } from './algorithm.js';
import { allPairsScene } from './scene.js';
import { allPairsIRs } from './irs.js';
import { allPairsStageView } from './all-pairs-stage.js';
import { allPairsFacet } from './facet.js';

export { allPairs, readAllPairsData } from './algorithm.js';
export type { AllPairsFacetData, AllPairsTable } from './algorithm.js';
export { allPairsScene } from './scene.js';
export type { AllPairsScene, AllPairsStep, AllPairsPair } from './scene.js';
export { allPairsIRs } from './irs.js';
export { allPairsStageView } from './all-pairs-stage.js';
export { allPairsFacet } from './facet.js';

/** 이 조각을 레지스트리에 올린다. 호출은 호스트 몫이다. */
export function registerAllPairs(): void {
  registerAlgorithm<AllPairsFacetData>('allPairs', allPairs, { mechanismKind: 'reactive' });
  registerScenePlan('allPairsScene', allPairsScene);
  for (const ir of allPairsIRs) registerIR(ir.id, ir);
  registerView('all-pairs-stage', allPairsStageView);
  registerFacets([allPairsFacet]);
}
