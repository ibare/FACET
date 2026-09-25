import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { narrowingLoss, type NarrowingLossFacetData } from './algorithm.js';
import { narrowingLossScene } from './scene.js';
import { narrowingLossStageView } from './narrowing-loss-stage.js';
import { narrowingLossIRs } from './irs.js';
import { narrowingLossFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './narrowing-loss-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerNarrowingLoss(): void {
  registerAlgorithm<NarrowingLossFacetData>('narrowingLoss', narrowingLoss, { mechanismKind: 'reactive' });
  registerScenePlan('narrowingLossScene', narrowingLossScene);
  for (const ir of narrowingLossIRs) registerIR(ir.id, ir);
  registerView('narrowing-loss-stage', narrowingLossStageView);
  registerFacets([narrowingLossFacet]);
}
