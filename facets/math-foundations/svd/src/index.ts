/**
 * svd — SVD 와 저랭크 근사 완제품. 등록은 register 함수 하나로.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { svdAlgorithm, type SvdData } from './algorithm.js';
import { svdProjector } from './projector.js';
import { svdIRs } from './irs.js';
import { svdStageView } from './svd-stage.js';
import { svdFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './svd-stage.js';
export * from './facet.js';

export function registerSvd(): void {
  registerAlgorithm<SvdData>('svd', svdAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('svdProjector', svdProjector);
  for (const ir of svdIRs) registerIR(ir.id, ir);
  registerView('svd-stage', svdStageView);
  registerFacets([svdFacet]);
}
