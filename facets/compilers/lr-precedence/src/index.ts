/**
 * lr-precedence — LR 파싱: 충돌과 우선순위. 손잡이가 있어 reactive 로 등록한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { lrPrecedenceAlgorithm, type LrPrecedenceData } from './algorithm.js';
import { lrPrecedenceProjector } from './projector.js';
import { lrPrecedenceIRs } from './irs.js';
import { lrPrecedenceStageView } from './lr-precedence-stage.js';
import { lrPrecedenceFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './lr-precedence-stage.js';
export * from './facet.js';

export function registerLrPrecedence(): void {
  registerAlgorithm<LrPrecedenceData>('lrPrecedence', lrPrecedenceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('lrPrecedenceProjector', lrPrecedenceProjector);
  for (const ir of lrPrecedenceIRs) registerIR(ir.id, ir);
  registerView('lr-precedence-stage', lrPrecedenceStageView);
  registerFacets([lrPrecedenceFacet]);
}
