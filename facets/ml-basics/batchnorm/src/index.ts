/**
 * batchnorm — 배치 정규화: 한 값이 누구와 한 묶음이냐.
 * 등록은 호스트가 `registerBatchnorm()` 로 한 번 부른다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { batchnormAlgorithm, type BatchnormData } from './algorithm.js';
import { batchnormProjector } from './projector.js';
import { batchnormIRs } from './irs.js';
import { batchnormStageView } from './batchnorm-stage.js';
import { batchnormFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './batchnorm-stage.js';
export * from './facet.js';

export function registerBatchnorm(): void {
  registerAlgorithm<BatchnormData>('batchnorm', batchnormAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('batchnormProjector', batchnormProjector);
  for (const ir of batchnormIRs) registerIR(ir.id, ir);
  registerView('batchnorm-stage', batchnormStageView);
  registerFacets([batchnormFacet]);
}
