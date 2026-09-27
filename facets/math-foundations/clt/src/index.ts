/**
 * @ffacet/algorithm-clt — 분포와 중심 극한 (facet:clt).
 *
 * `registerClt()` 를 부르면 알고리즘 · projector · IR · 무대 · facet 선언을 등록한다.
 * 손잡이가 있으므로 알고리즘은 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { cltAlgorithm, type CltData } from './algorithm.js';
import { cltProjector } from './projector.js';
import { cltIRs } from './irs.js';
import { cltStageView } from './clt-stage.js';
import { cltFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './clt-stage.js';
export * from './facet.js';

export function registerClt(): void {
  registerAlgorithm<CltData>('clt', cltAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('cltProjector', cltProjector);
  for (const ir of cltIRs) registerIR(ir.id, ir);
  registerView('clt-stage', cltStageView);
  registerFacets([cltFacet]);
}
