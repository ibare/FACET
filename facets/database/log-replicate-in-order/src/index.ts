import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { logReplicateInOrder, type LogReplicateInOrderFacetData } from './algorithm.js';
import { logReplicateInOrderScene } from './scene.js';
import { logReplicateInOrderStageView } from './log-replicate-in-order-stage.js';
import { logReplicateInOrderIRs } from './irs.js';
import { logReplicateInOrderFacet } from './facet.js';

export { logReplicateInOrder, narrowLogData } from './algorithm.js';
export type { LogEntry, IndexedEntry, LogReplicateInOrderFacetData } from './algorithm.js';
export { logReplicateInOrderScene } from './scene.js';
export type { LogScene, LogStep, Probe, SceneEntry } from './scene.js';
export { logReplicateInOrderStageView } from './log-replicate-in-order-stage.js';
export { logReplicateInOrderIRs } from './irs.js';
export { logReplicateInOrderFacet } from './facet.js';

export function registerLogReplicateInOrder(): void {
  registerAlgorithm<LogReplicateInOrderFacetData>('logReplicateInOrder', logReplicateInOrder, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('logReplicateInOrderScene', logReplicateInOrderScene);
  for (const ir of logReplicateInOrderIRs) registerIR(ir.id, ir);
  registerView('log-replicate-in-order-stage', logReplicateInOrderStageView);
  registerFacets([logReplicateInOrderFacet]);
}
