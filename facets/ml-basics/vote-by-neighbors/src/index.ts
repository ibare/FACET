/**
 * 최근접 이웃 투표 조각 — 등록 진입점.
 *
 * 호출은 호스트가 한다. 이 파일은 사이드 이펙트로 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { voteByNeighborsAlgorithm } from './algorithm.js';
import { voteByNeighborsProjector } from './projector.js';
import { voteByNeighborsIRs } from './irs.js';
import { voteByNeighborsStageView } from './vote-by-neighbors-stage.js';
import { voteByNeighborsFacet } from './facet.js';
import { voteByNeighborsDescription } from './description.js';

export { voteByNeighborsAlgorithm } from './algorithm.js';
export type { VoteByNeighborsData, VoteByNeighborsPoint } from './algorithm.js';
export { voteByNeighborsProjector } from './projector.js';
export { voteByNeighborsIRs } from './irs.js';
export { voteByNeighborsStageView } from './vote-by-neighbors-stage.js';
export { voteByNeighborsFacet } from './facet.js';
export { voteByNeighborsDescription } from './description.js';

export function registerVoteByNeighbors(): void {
  registerAlgorithm('voteByNeighbors', voteByNeighborsAlgorithm, {
    // 조각은 스스로 시작하고 스스로 걸음 간격을 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('voteByNeighborsProjector', voteByNeighborsProjector);
  for (const ir of voteByNeighborsIRs) registerIR(ir.id, ir);
  registerView('vote-by-neighbors-stage', voteByNeighborsStageView);
  registerFacets([voteByNeighborsFacet]);
  registerDescription(voteByNeighborsFacet.id, voteByNeighborsDescription);
}
