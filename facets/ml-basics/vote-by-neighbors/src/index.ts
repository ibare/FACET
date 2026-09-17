/**
 * 최근접 이웃 투표 조각 — 등록 진입점.
 *
 * 호출은 호스트가 한다. 이 파일은 사이드 이펙트로 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { voteByNeighborsAlgorithm } from './algorithm.js';
import { voteByNeighborsIRs } from './irs.js';
import { voteByNeighborsScene } from './scene.js';
import { voteByNeighborsStageView } from './vote-by-neighbors-stage.js';
import { voteByNeighborsFacet } from './facet.js';

export { voteByNeighborsAlgorithm, voteCallCount } from './algorithm.js';
export type { VoteByNeighborsData, VoteByNeighborsPoint } from './algorithm.js';
export { voteByNeighborsIRs } from './irs.js';
export { voteByNeighborsStageView } from './vote-by-neighbors-stage.js';
export { voteByNeighborsFacet } from './facet.js';
export {
  voteByNeighborsScene,
  type VoteByNeighborsScene,
  type VoteCaption,
  type VoteSlip,
  type VoteStep,
} from './scene.js';

export function registerVoteByNeighbors(): void {
  registerAlgorithm('voteByNeighbors', voteByNeighborsAlgorithm, {
    // 조각은 스스로 시작하고 스스로 걸음 간격을 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4, packages/core/test/register-names.test.ts).
  registerScenePlan('voteByNeighborsScene', voteByNeighborsScene);
  for (const ir of voteByNeighborsIRs) registerIR(ir.id, ir);
  registerView('vote-by-neighbors-stage', voteByNeighborsStageView);
  registerFacets([voteByNeighborsFacet]);
}
