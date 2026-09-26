/**
 * dml 완제품 — 같은 INSERT · UPDATE · DELETE 셋의 차례를 손잡이로 바꾼다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { dmlAlgorithm, type DmlData } from './algorithm.js';
import { dmlProjector } from './projector.js';
import { dmlIRs } from './irs.js';
import { dmlStageView } from './dml-stage.js';
import { dmlFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './dml-stage.js';
export * from './facet.js';

export function registerDml(): void {
  registerAlgorithm<DmlData>('dml', dmlAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dmlProjector', dmlProjector);
  for (const ir of dmlIRs) registerIR(ir.id, ir);
  registerView('dml-stage', dmlStageView);
  registerFacets([dmlFacet]);
}
