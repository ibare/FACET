import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { coalesceUpdates } from './algorithm.js';
import { coalesceUpdatesScene } from './scene.js';
import { coalesceUpdatesIRs } from './irs.js';
import { coalesceUpdatesStageView } from './coalesce-updates-stage.js';
import { coalesceUpdatesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './coalesce-updates-stage.js';
export * from './facet.js';

export function registerCoalesceUpdates(): void {
  registerAlgorithm('coalesceUpdates', coalesceUpdates, { mechanismKind: 'reactive' });
  registerScenePlan('coalesceUpdatesScene', coalesceUpdatesScene);
  for (const ir of coalesceUpdatesIRs) registerIR(ir.id, ir);
  registerView('coalesce-updates-stage', coalesceUpdatesStageView);
  registerFacets([coalesceUpdatesFacet]);
}
