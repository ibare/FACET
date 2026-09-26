import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { unreachableSnapshot, type UnreachableSnapshotFacetData } from './algorithm.js';
import { unreachableSnapshotScene } from './scene.js';
import { unreachableSnapshotIRs } from './irs.js';
import { unreachableSnapshotStageView } from './unreachable-snapshot-stage.js';
import { unreachableSnapshotFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './unreachable-snapshot-stage.js';
export * from './facet.js';

export function registerUnreachableSnapshot(): void {
  registerAlgorithm<UnreachableSnapshotFacetData>('unreachableSnapshot', unreachableSnapshot, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('unreachableSnapshotScene', unreachableSnapshotScene);
  for (const ir of unreachableSnapshotIRs) registerIR(ir.id, ir);
  registerView('unreachable-snapshot-stage', unreachableSnapshotStageView);
  registerFacets([unreachableSnapshotFacet]);
}
