import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { vanishingOverTime, type VanishingOverTimeFacetData } from './algorithm.js';
import { vanishingOverTimeFacet } from './facet.js';
import { vanishingOverTimeIRs } from './irs.js';
import { vanishingOverTimeScene } from './scene.js';
import { vanishingOverTimeStageView } from './vanishing-over-time-stage.js';

export {
  forwardHidden,
  narrowVanishingData,
  vanishingOverTime,
  type VanishingOverTimeFacetData,
  type VanishingSymbols,
} from './algorithm.js';
export {
  vanishingOverTimeScene,
  type VanishingOverTimeScene,
  type VanishingReach,
  type VanishingStep,
} from './scene.js';
export { vanishingOverTimeStageView } from './vanishing-over-time-stage.js';
export { vanishingOverTimeIRs } from './irs.js';
export { vanishingOverTimeFacet } from './facet.js';

export function registerVanishingOverTime(): void {
  registerAlgorithm<VanishingOverTimeFacetData>('vanishingOverTime', vanishingOverTime, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('vanishingOverTimeScene', vanishingOverTimeScene);
  for (const ir of vanishingOverTimeIRs) registerIR(ir.id, ir);
  registerView('vanishing-over-time-stage', vanishingOverTimeStageView);
  registerFacets([vanishingOverTimeFacet]);
}
