import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { readyQueuePick, type ReadyQueuePickFacetData } from './algorithm.js';
import { readyQueuePickScene } from './scene.js';
import { readyQueuePickIRs } from './irs.js';
import { readyQueuePickStageView } from './ready-queue-pick-stage.js';
import { readyQueuePickFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './ready-queue-pick-stage.js';
export * from './facet.js';

export function registerReadyQueuePick(): void {
  registerAlgorithm<ReadyQueuePickFacetData>('readyQueuePick', readyQueuePick, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('readyQueuePickScene', readyQueuePickScene);
  for (const ir of readyQueuePickIRs) registerIR(ir.id, ir);
  registerView('ready-queue-pick-stage', readyQueuePickStageView);
  registerFacets([readyQueuePickFacet]);
}
