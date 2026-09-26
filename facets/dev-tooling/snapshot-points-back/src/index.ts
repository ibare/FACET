import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { snapshotPointsBack, type SnapshotPointsBackFacetData } from './algorithm.js';
import { snapshotPointsBackScene } from './scene.js';
import { snapshotPointsBackIRs } from './irs.js';
import { snapshotPointsBackStageView } from './snapshot-points-back-stage.js';
import { snapshotPointsBackFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './snapshot-points-back-stage.js';
export * from './facet.js';

export function registerSnapshotPointsBack(): void {
  registerAlgorithm<SnapshotPointsBackFacetData>('snapshotPointsBack', snapshotPointsBack, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('snapshotPointsBackScene', snapshotPointsBackScene);
  for (const ir of snapshotPointsBackIRs) registerIR(ir.id, ir);
  registerView('snapshot-points-back-stage', snapshotPointsBackStageView);
  registerFacets([snapshotPointsBackFacet]);
}
