import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { threeNumbers } from './algorithm.js';
import type { ThreeNumbersFacetData } from './algorithm.js';
import { threeNumbersScene } from './scene.js';
import { threeNumbersIRs } from './irs.js';
import { threeNumbersStageView } from './three-numbers-stage.js';
import { threeNumbersFacet } from './facet.js';

export {
  threeNumbers,
  parseVersion,
  formatVersion,
  heaviestOf,
  bump,
} from './algorithm.js';
export type { ThreeNumbersFacetData, Change, ChangeKind, Version, Place } from './algorithm.js';
export { threeNumbersScene } from './scene.js';
export type { ThreeNumbersScene, ThreeNumbersStep } from './scene.js';
export { threeNumbersIRs } from './irs.js';
export { threeNumbersStageView } from './three-numbers-stage.js';
export { threeNumbersFacet } from './facet.js';

export function registerThreeNumbers(): void {
  registerAlgorithm<ThreeNumbersFacetData>('threeNumbers', threeNumbers, { mechanismKind: 'reactive' });
  registerScenePlan('threeNumbersScene', threeNumbersScene);
  for (const ir of threeNumbersIRs) registerIR(ir.id, ir);
  registerView('three-numbers-stage', threeNumbersStageView);
  registerFacets([threeNumbersFacet]);
}
