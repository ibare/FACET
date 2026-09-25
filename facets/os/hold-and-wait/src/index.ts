import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { holdAndWait, type HoldAndWaitFacetData } from './algorithm.js';
import { holdAndWaitScene } from './scene.js';
import { holdAndWaitIRs } from './irs.js';
import { holdAndWaitStageView } from './hold-and-wait-stage.js';
import { holdAndWaitFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './hold-and-wait-stage.js';
export * from './facet.js';

export function registerHoldAndWait(): void {
  registerAlgorithm<HoldAndWaitFacetData>('holdAndWait', holdAndWait, { mechanismKind: 'reactive' });
  registerScenePlan('holdAndWaitScene', holdAndWaitScene);
  for (const ir of holdAndWaitIRs) registerIR(ir.id, ir);
  registerView('hold-and-wait-stage', holdAndWaitStageView);
  registerFacets([holdAndWaitFacet]);
}
