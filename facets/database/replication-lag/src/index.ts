import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { replicationLag, type ReplicationLagFacetData } from './algorithm.js';
import { replicationLagScene } from './scene.js';
import { replicationLagStageView } from './replication-lag-stage.js';
import { replicationLagIRs } from './irs.js';
import { replicationLagFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './replication-lag-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerReplicationLag(): void {
  registerAlgorithm<ReplicationLagFacetData>('replicationLag', replicationLag, { mechanismKind: 'reactive' });
  registerScenePlan('replicationLagScene', replicationLagScene);
  for (const ir of replicationLagIRs) registerIR(ir.id, ir);
  registerView('replication-lag-stage', replicationLagStageView);
  registerFacets([replicationLagFacet]);
}
