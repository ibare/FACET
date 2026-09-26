import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { exactMatchOnly, type ExactMatchOnlyFacetData } from './algorithm.js';
import { exactMatchOnlyScene } from './scene.js';
import { exactMatchOnlyStageView } from './exact-match-only-stage.js';
import { exactMatchOnlyIRs } from './irs.js';
import { exactMatchOnlyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './exact-match-only-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerExactMatchOnly(): void {
  registerAlgorithm<ExactMatchOnlyFacetData>('exactMatchOnly', exactMatchOnly, { mechanismKind: 'reactive' });
  registerScenePlan('exactMatchOnlyScene', exactMatchOnlyScene);
  for (const ir of exactMatchOnlyIRs) registerIR(ir.id, ir);
  registerView('exact-match-only-stage', exactMatchOnlyStageView);
  registerFacets([exactMatchOnlyFacet]);
}
