/**
 * loss — 손실 함수의 모양이 미는 크기를 정한다 (완제품).
 */

import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { lossAlgorithm, type LossData } from './algorithm.js';
import { lossProjector } from './projector.js';
import { lossIRs } from './irs.js';
import { lossStageView } from './loss-stage.js';
import { lossFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './loss-stage.js';
export * from './facet.js';

export function registerLoss(): void {
  registerAlgorithm<LossData>('loss', lossAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('lossProjector', lossProjector);
  for (const ir of lossIRs) registerIR(ir.id, ir);
  registerView('loss-stage', lossStageView);
  registerFacets([lossFacet]);
}
