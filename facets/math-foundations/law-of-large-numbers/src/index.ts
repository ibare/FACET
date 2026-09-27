import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lawOfLargeNumbers, type LawOfLargeNumbersFacetData } from './algorithm.js';
import { lawOfLargeNumbersScene } from './scene.js';
import { lawOfLargeNumbersStageView } from './law-of-large-numbers-stage.js';
import { lawOfLargeNumbersIRs } from './irs.js';
import { lawOfLargeNumbersFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './law-of-large-numbers-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerLawOfLargeNumbers(): void {
  registerAlgorithm<LawOfLargeNumbersFacetData>('lawOfLargeNumbers', lawOfLargeNumbers, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('lawOfLargeNumbersScene', lawOfLargeNumbersScene);
  for (const ir of lawOfLargeNumbersIRs) registerIR(ir.id, ir);
  registerView('law-of-large-numbers-stage', lawOfLargeNumbersStageView);
  registerFacets([lawOfLargeNumbersFacet]);
}
