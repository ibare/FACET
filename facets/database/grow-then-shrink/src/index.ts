import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { growThenShrink, type GrowThenShrinkFacetData } from './algorithm.js';
import { growThenShrinkScene } from './scene.js';
import { growThenShrinkStageView } from './grow-then-shrink-stage.js';
import { growThenShrinkIRs } from './irs.js';
import { growThenShrinkFacet } from './facet.js';

export { growThenShrink, lockModeOf } from './algorithm.js';
export type { GrowThenShrinkFacetData, GrowThenShrinkOp } from './algorithm.js';
export { growThenShrinkScene } from './scene.js';
export type { GrowThenShrinkScene, GrowThenShrinkStep, HeldLock, LockMode } from './scene.js';
export { growThenShrinkStageView } from './grow-then-shrink-stage.js';
export { growThenShrinkIRs } from './irs.js';
export { growThenShrinkFacet } from './facet.js';

export function registerGrowThenShrink(): void {
  registerAlgorithm<GrowThenShrinkFacetData>('growThenShrink', growThenShrink, { mechanismKind: 'reactive' });
  registerScenePlan('growThenShrinkScene', growThenShrinkScene);
  for (const ir of growThenShrinkIRs) registerIR(ir.id, ir);
  registerView('grow-then-shrink-stage', growThenShrinkStageView);
  registerFacets([growThenShrinkFacet]);
}
