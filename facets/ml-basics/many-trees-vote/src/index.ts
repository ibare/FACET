/**
 * 앙상블 투표 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 호출은 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { manyTreesVoteAlgorithm } from './algorithm.js';
import { manyTreesVoteScene } from './scene.js';
import { manyTreesVoteIRs } from './irs.js';
import { manyTreesVoteStageView } from './many-trees-vote-stage.js';
import { manyTreesVoteFacet } from './facet.js';

export { manyTreesVoteAlgorithm, majorityIndex, voteCounts } from './algorithm.js';
export type { ManyTreesVoteData } from './algorithm.js';
export { manyTreesVoteIRs } from './irs.js';
export { manyTreesVoteStageView } from './many-trees-vote-stage.js';
export { manyTreesVoteFacet } from './facet.js';
export {
  manyTreesVoteScene,
  readVoteBoard,
  type ManyTreesVoteScene,
  type VoteBoard,
  type VoteCaption,
  type VoteStep,
} from './scene.js';

export function registerManyTreesVote(): void {
  registerAlgorithm('manyTreesVote', manyTreesVoteAlgorithm, {
    // 조각은 스스로 시작하고 스스로 걸음 간격을 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4, packages/core/test/register-names.test.ts).
  registerScenePlan('manyTreesVoteScene', manyTreesVoteScene);
  for (const ir of manyTreesVoteIRs) registerIR(ir.id, ir);
  registerView('many-trees-vote-stage', manyTreesVoteStageView);
  registerFacets([manyTreesVoteFacet]);
}
