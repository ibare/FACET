import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { longestPrefixMatch, type LongestPrefixMatchFacetData } from './algorithm.js';
import { longestPrefixMatchScene } from './scene.js';
import { longestPrefixMatchIRs } from './irs.js';
import { longestPrefixMatchStageView } from './longest-prefix-match-stage.js';
import { longestPrefixMatchFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './longest-prefix-match-stage.js';
export * from './facet.js';

export function registerLongestPrefixMatch(): void {
  registerAlgorithm<LongestPrefixMatchFacetData>('longestPrefixMatch', longestPrefixMatch, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('longestPrefixMatchScene', longestPrefixMatchScene);
  for (const ir of longestPrefixMatchIRs) registerIR(ir.id, ir);
  registerView('longest-prefix-match-stage', longestPrefixMatchStageView);
  registerFacets([longestPrefixMatchFacet]);
}
