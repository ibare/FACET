import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { backwardTaken, type BackwardTakenFacetData } from './algorithm.js';
import { backwardTakenStageView } from './backward-taken-stage.js';
import { backwardTakenFacet } from './facet.js';
import { backwardTakenIRs } from './irs.js';
import { backwardTakenScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export { backwardTakenStageView } from './backward-taken-stage.js';
export { backwardTakenIRs } from './irs.js';
export { backwardTakenFacet } from './facet.js';

export function registerBackwardTaken(): void {
  registerAlgorithm<BackwardTakenFacetData>('backwardTaken', backwardTaken, { mechanismKind: 'reactive' });
  registerScenePlan('backwardTakenScene', backwardTakenScene);
  for (const ir of backwardTakenIRs) registerIR(ir.id, ir);
  registerView('backward-taken-stage', backwardTakenStageView);
  registerFacets([backwardTakenFacet]);
}
