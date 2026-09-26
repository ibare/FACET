/**
 * sgd — 확률적 경사 하강과 미니배치 (묶음 크기). 손잡이가 있어 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { sgdAlgorithm, type SgdData } from './algorithm.js';
import { sgdProjector } from './projector.js';
import { sgdIRs } from './irs.js';
import { sgdStageView } from './sgd-stage.js';
import { sgdFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './sgd-stage.js';
export * from './facet.js';

export function registerSgd(): void {
  registerAlgorithm<SgdData>('sgd', sgdAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('sgdProjector', sgdProjector);
  for (const ir of sgdIRs) registerIR(ir.id, ir);
  registerView('sgd-stage', sgdStageView);
  registerFacets([sgdFacet]);
}
