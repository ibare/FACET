/**
 * integral — 미분과 적분: 쪼개어 다가간다.
 *
 * 등록 순서: algorithm(reactive) → projector → IR → view → facet. `registerIntegral()` 은 스스로 부르지 않는다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { integralAlgorithm, type IntegralData } from './algorithm.js';
import { integralProjector } from './projector.js';
import { integralIRs } from './irs.js';
import { integralStageView } from './integral-stage.js';
import { integralFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './integral-stage.js';
export * from './facet.js';

export function registerIntegral(): void {
  registerAlgorithm<IntegralData>('integral', integralAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('integralProjector', integralProjector);
  for (const ir of integralIRs) registerIR(ir.id, ir);
  registerView('integral-stage', integralStageView);
  registerFacets([integralFacet]);
}
