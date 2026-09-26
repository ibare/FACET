import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { microtaskStarvation } from './algorithm.js';
import { microtaskStarvationScene } from './scene.js';
import { microtaskStarvationIRs } from './irs.js';
import { microtaskStarvationStageView } from './microtask-starvation-stage.js';
import { microtaskStarvationFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './microtask-starvation-stage.js';
export * from './facet.js';

export function registerMicrotaskStarvation(): void {
  registerAlgorithm('microtaskStarvation', microtaskStarvation, { mechanismKind: 'reactive' });
  registerScenePlan('microtaskStarvationScene', microtaskStarvationScene);
  for (const ir of microtaskStarvationIRs) registerIR(ir.id, ir);
  registerView('microtask-starvation-stage', microtaskStarvationStageView);
  registerFacets([microtaskStarvationFacet]);
}
