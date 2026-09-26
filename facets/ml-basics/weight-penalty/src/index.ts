/**
 * weight-penalty — 등록. 호스트가 registerWeightPenalty() 를 부른다 (여기서 스스로 부르지 않는다).
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { weightPenaltyAlgorithm } from './algorithm.js';
import type { WeightPenaltyData } from './algorithm.js';
import { weightPenaltyProjector } from './projector.js';
import { weightPenaltyIRs } from './irs.js';
import { weightPenaltyStageView } from './weight-penalty-stage.js';
import { weightPenaltyFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './weight-penalty-stage.js';
export * from './facet.js';

export function registerWeightPenalty(): void {
  registerAlgorithm<WeightPenaltyData>('weightPenalty', weightPenaltyAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('weightPenaltyProjector', weightPenaltyProjector);
  for (const ir of weightPenaltyIRs) registerIR(ir.id, ir);
  registerView('weight-penalty-stage', weightPenaltyStageView);
  registerFacets([weightPenaltyFacet]);
}
