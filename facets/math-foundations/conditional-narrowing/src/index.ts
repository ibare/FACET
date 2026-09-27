import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { conditionalNarrowing, type ConditionalNarrowingFacetData } from './algorithm.js';
import { conditionalNarrowingScene } from './scene.js';
import { conditionalNarrowingStageView } from './conditional-narrowing-stage.js';
import { conditionalNarrowingIRs } from './irs.js';
import { conditionalNarrowingFacet } from './facet.js';

export {
  conditionalNarrowing,
  enumerateOutcomes,
  narrowConditionalNarrowingData,
  type ConditionalNarrowingFacetData,
  type Outcome,
} from './algorithm.js';
export {
  conditionalNarrowingScene,
  type ConditionalNarrowingScene,
  type NarrowingStep,
  type Share,
} from './scene.js';
export { conditionalNarrowingStageView } from './conditional-narrowing-stage.js';
export { conditionalNarrowingIRs } from './irs.js';
export { conditionalNarrowingFacet } from './facet.js';

export function registerConditionalNarrowing(): void {
  registerAlgorithm<ConditionalNarrowingFacetData>('conditionalNarrowing', conditionalNarrowing, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('conditionalNarrowingScene', conditionalNarrowingScene);
  for (const ir of conditionalNarrowingIRs) registerIR(ir.id, ir);
  registerView('conditional-narrowing-stage', conditionalNarrowingStageView);
  registerFacets([conditionalNarrowingFacet]);
}
