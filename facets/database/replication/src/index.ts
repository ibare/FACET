import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { replicationAlgorithm, type ReplicationData } from './algorithm.js';
import { replicationFacet } from './facet.js';
import { replicationIRs } from './irs.js';
import { replicationProjector } from './projector.js';
import { replicationStageView } from './replication-stage.js';

export {
  answerAt,
  computeReplication,
  freshAt,
  replicationAlgorithm,
  staleAt,
  type ReplicationData,
  type ReplicationRound,
} from './algorithm.js';
export { replicationFacet } from './facet.js';
export { replicationIRs, replicationImperativeIR } from './irs.js';
export { replicationProjector } from './projector.js';
export { replicationStageView, type ReplicationStage } from './replication-stage.js';

/** 복제와 CAP 을 등록한다 — 손잡이가 있으니 reactive. */
export function registerReplication(): void {
  registerAlgorithm<ReplicationData>('replication', replicationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('replicationProjector', replicationProjector);
  for (const ir of replicationIRs) registerIR(ir.id, ir);
  registerView('replication-stage', replicationStageView);
  registerFacets([replicationFacet]);
}
