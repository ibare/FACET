/**
 * @ffacet/algorithm-raft — Raft 완제품. 과반 문턱이 선출과 확정에 함께 걸린다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { raftAlgorithm, type RaftData } from './algorithm.js';
import { raftProjector } from './projector.js';
import { raftIRs } from './irs.js';
import { raftStageView } from './raft-stage.js';
import { raftFacet } from './facet.js';

export { raftAlgorithm, reachMajority, raftRound, type RaftData, type RaftRound } from './algorithm.js';
export { raftProjector } from './projector.js';
export { raftImperativeIR, raftIRs } from './irs.js';
export { raftStageView, type RaftStage } from './raft-stage.js';
export { raftFacet } from './facet.js';

export function registerRaft(): void {
  registerAlgorithm<RaftData>('raft', raftAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('raftProjector', raftProjector);
  for (const ir of raftIRs) registerIR(ir.id, ir);
  registerView('raft-stage', raftStageView);
  registerFacets([raftFacet]);
}
