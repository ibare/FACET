import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { blockedWaitsEvent, type BlockedWaitsEventFacetData } from './algorithm.js';
import { blockedWaitsEventScene } from './scene.js';
import { blockedWaitsEventStageView } from './blocked-waits-event-stage.js';
import { blockedWaitsEventIRs } from './irs.js';
import { blockedWaitsEventFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './blocked-waits-event-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerBlockedWaitsEvent(): void {
  registerAlgorithm<BlockedWaitsEventFacetData>('blockedWaitsEvent', blockedWaitsEvent, { mechanismKind: 'reactive' });
  registerScenePlan('blockedWaitsEventScene', blockedWaitsEventScene);
  for (const ir of blockedWaitsEventIRs) registerIR(ir.id, ir);
  registerView('blocked-waits-event-stage', blockedWaitsEventStageView);
  registerFacets([blockedWaitsEventFacet]);
}
