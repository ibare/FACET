import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { longestMatchWins, type LongestMatchWinsFacetData } from './algorithm.js';
import { longestMatchWinsScene } from './scene.js';
import { longestMatchWinsIRs } from './irs.js';
import { longestMatchWinsStageView } from './longest-match-wins-stage.js';
import { longestMatchWinsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './longest-match-wins-stage.js';
export * from './facet.js';

export function registerLongestMatchWins(): void {
  registerAlgorithm<LongestMatchWinsFacetData>('longestMatchWins', longestMatchWins, { mechanismKind: 'reactive' });
  registerScenePlan('longestMatchWinsScene', longestMatchWinsScene);
  for (const ir of longestMatchWinsIRs) registerIR(ir.id, ir);
  registerView('longest-match-wins-stage', longestMatchWinsStageView);
  registerFacets([longestMatchWinsFacet]);
}
