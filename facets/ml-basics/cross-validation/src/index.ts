/**
 * cross-validation — 떼어 두기와 교차 검증. 등록은 호스트가 register 함수 하나로 한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { crossValidationAlgorithm, type CrossValidationData } from './algorithm.js';
import { crossValidationProjector } from './projector.js';
import { crossValidationIRs } from './irs.js';
import { crossValidationStageView } from './cross-validation-stage.js';
import { crossValidationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './cross-validation-stage.js';
export * from './facet.js';

export function registerCrossValidation(): void {
  registerAlgorithm<CrossValidationData>('crossValidation', crossValidationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('crossValidationProjector', crossValidationProjector);
  for (const ir of crossValidationIRs) registerIR(ir.id, ir);
  registerView('cross-validation-stage', crossValidationStageView);
  registerFacets([crossValidationFacet]);
}
