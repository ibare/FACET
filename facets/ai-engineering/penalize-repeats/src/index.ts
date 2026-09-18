import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { penalizeRepeats, type PenalizeRepeatsFacetData } from './algorithm.js';
import { penalizeRepeatsScene } from './scene.js';
import { penalizeRepeatsStageView } from './penalize-repeats-stage.js';
import { penalizeRepeatsIRs } from './irs.js';
import { penalizeRepeatsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './penalize-repeats-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPenalizeRepeats(): void {
  registerAlgorithm<PenalizeRepeatsFacetData>('penalizeRepeats', penalizeRepeats, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('penalizeRepeatsScene', penalizeRepeatsScene);
  for (const ir of penalizeRepeatsIRs) registerIR(ir.id, ir);
  registerView('penalize-repeats-stage', penalizeRepeatsStageView);
  registerFacets([penalizeRepeatsFacet]);
}
