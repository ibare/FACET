import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { rangeAndCandidates, type RangeAndCandidatesFacetData } from './algorithm.js';
import { rangeAndCandidatesScene } from './scene.js';
import { rangeAndCandidatesStageView } from './range-and-candidates-stage.js';
import { rangeAndCandidatesIRs } from './irs.js';
import { rangeAndCandidatesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { rangeAndCandidatesStageView } from './range-and-candidates-stage.js';
export { rangeAndCandidatesIRs } from './irs.js';
export { rangeAndCandidatesFacet } from './facet.js';

export function registerRangeAndCandidates(): void {
  registerAlgorithm<RangeAndCandidatesFacetData>('rangeAndCandidates', rangeAndCandidates, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('rangeAndCandidatesScene', rangeAndCandidatesScene);
  for (const ir of rangeAndCandidatesIRs) registerIR(ir.id, ir);
  registerView('range-and-candidates-stage', rangeAndCandidatesStageView);
  registerFacets([rangeAndCandidatesFacet]);
}
