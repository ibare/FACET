import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { forcedSyncLayout, type ForcedSyncLayoutFacetData } from './algorithm.js';
import { forcedSyncLayoutScene } from './scene.js';
import { forcedSyncLayoutStageView } from './forced-sync-layout-stage.js';
import { forcedSyncLayoutIRs } from './irs.js';
import { forcedSyncLayoutFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './forced-sync-layout-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerForcedSyncLayout(): void {
  registerAlgorithm<ForcedSyncLayoutFacetData>('forcedSyncLayout', forcedSyncLayout, { mechanismKind: 'reactive' });
  registerScenePlan('forcedSyncLayoutScene', forcedSyncLayoutScene);
  for (const ir of forcedSyncLayoutIRs) registerIR(ir.id, ir);
  registerView('forced-sync-layout-stage', forcedSyncLayoutStageView);
  registerFacets([forcedSyncLayoutFacet]);
}
