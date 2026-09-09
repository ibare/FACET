/**
 * 앙상블 투표 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 호출은 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { manyTreesVoteAlgorithm } from './algorithm.js';
import { manyTreesVoteProjector } from './projector.js';
import { manyTreesVoteIRs } from './irs.js';
import { manyTreesVoteStageView } from './many-trees-vote-stage.js';
import { manyTreesVoteFacet } from './facet.js';
import { manyTreesVoteDescription } from './description.js';

export { manyTreesVoteAlgorithm } from './algorithm.js';
export type { ManyTreesVoteData } from './algorithm.js';
export { manyTreesVoteProjector } from './projector.js';
export { manyTreesVoteIRs } from './irs.js';
export { manyTreesVoteStageView, readVoteModel } from './many-trees-vote-stage.js';
export type { ManyTreesVoteStage, VoteModel } from './many-trees-vote-stage.js';
export { manyTreesVoteFacet } from './facet.js';
export { manyTreesVoteDescription } from './description.js';

export function registerManyTreesVote(): void {
  registerAlgorithm('manyTreesVote', manyTreesVoteAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('manyTreesVoteProjector', manyTreesVoteProjector);
  for (const ir of manyTreesVoteIRs) registerIR(ir.id, ir);
  registerView('many-trees-vote-stage', manyTreesVoteStageView);
  registerFacets([manyTreesVoteFacet]);
  registerDescription(manyTreesVoteFacet.id, manyTreesVoteDescription);
}
