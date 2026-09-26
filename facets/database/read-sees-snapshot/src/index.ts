import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { readSeesSnapshot, type ReadSeesSnapshotFacetData } from './algorithm.js';
import { readSeesSnapshotScene } from './scene.js';
import { readSeesSnapshotStageView } from './read-sees-snapshot-stage.js';
import { readSeesSnapshotIRs } from './irs.js';
import { readSeesSnapshotFacet } from './facet.js';

export { readSeesSnapshot, type ReadSeesSnapshotFacetData, type SnapshotEvent } from './algorithm.js';
export {
  readSeesSnapshotScene,
  type SnapshotScene,
  type SnapshotStep,
  type SceneVersion,
  type SceneSnap,
  type SceneRead,
} from './scene.js';
export { readSeesSnapshotStageView } from './read-sees-snapshot-stage.js';
export { readSeesSnapshotIRs } from './irs.js';
export { readSeesSnapshotFacet } from './facet.js';

export function registerReadSeesSnapshot(): void {
  registerAlgorithm<ReadSeesSnapshotFacetData>('readSeesSnapshot', readSeesSnapshot, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('readSeesSnapshotScene', readSeesSnapshotScene);
  for (const ir of readSeesSnapshotIRs) registerIR(ir.id, ir);
  registerView('read-sees-snapshot-stage', readSeesSnapshotStageView);
  registerFacets([readSeesSnapshotFacet]);
}
