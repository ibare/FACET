import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { mispredictionPenalty, type MispredictionPenaltyFacetData } from './algorithm.js';
import { mispredictionPenaltyScene } from './scene.js';
import { mispredictionPenaltyIRs } from './irs.js';
import { mispredictionPenaltyStageView } from './misprediction-penalty-stage.js';
import { mispredictionPenaltyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './misprediction-penalty-stage.js';
export * from './facet.js';

export function registerMispredictionPenalty(): void {
  registerAlgorithm<MispredictionPenaltyFacetData>('mispredictionPenalty', mispredictionPenalty, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('mispredictionPenaltyScene', mispredictionPenaltyScene);
  for (const ir of mispredictionPenaltyIRs) registerIR(ir.id, ir);
  registerView('misprediction-penalty-stage', mispredictionPenaltyStageView);
  registerFacets([mispredictionPenaltyFacet]);
}
