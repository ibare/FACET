import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fuseTwoRankings, type FuseTwoRankingsFacetData } from './algorithm.js';
import { fuseTwoRankingsScene } from './scene.js';
import { fuseTwoRankingsStageView } from './fuse-two-rankings-stage.js';
import { fuseTwoRankingsIRs } from './irs.js';
import { fuseTwoRankingsFacet } from './facet.js';

export { fuseTwoRankings, type FuseTwoRankingsFacetData } from './algorithm.js';
export {
  fuseTwoRankingsScene,
  type FuseTwoRankingsScene,
  type FuseBase,
  type FuseShare,
  type FusedEntry,
  type FuseStep,
} from './scene.js';
export { fuseTwoRankingsStageView } from './fuse-two-rankings-stage.js';
export { fuseTwoRankingsIRs } from './irs.js';
export { fuseTwoRankingsFacet } from './facet.js';

export function registerFuseTwoRankings(): void {
  registerAlgorithm<FuseTwoRankingsFacetData>('fuseTwoRankings', fuseTwoRankings, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('fuseTwoRankingsScene', fuseTwoRankingsScene);
  for (const ir of fuseTwoRankingsIRs) registerIR(ir.id, ir);
  registerView('fuse-two-rankings-stage', fuseTwoRankingsStageView);
  registerFacets([fuseTwoRankingsFacet]);
}
