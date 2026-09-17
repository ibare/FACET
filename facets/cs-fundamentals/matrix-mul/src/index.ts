/**
 * matrix-mul 등록 진입점.
 *
 * 등록을 사이드 이펙트로 하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { matrixMulAlgorithm, type MatrixMulData } from './algorithm.js';
import { matrixMulProjector } from './projector.js';
import { matrixMulIRs } from './irs.js';
import { matrixMulStageView } from './matrix-mul-stage.js';
import { matrixMulFacet } from './facet.js';

export {
  matrixMulAlgorithm,
  combineAddCount,
  matrixSize,
  operandAddCount,
  productCount,
  standardAddCount,
  standardPairs,
  standardProduct,
  strassenCombines,
  strassenProduct,
  strassenTerms,
} from './algorithm.js';
export type { Combine, MatrixMulData, Pair, Part, Term } from './algorithm.js';
export { matrixMulProjector } from './projector.js';
export { matrixMulIRs, matrixMulImperativeIR } from './irs.js';
export { matrixMulStageView } from './matrix-mul-stage.js';
export { matrixMulFacet } from './facet.js';

export function registerMatrixMul(): void {
  // 손잡이가 있는 완제품이라 reactive 다. 세 상태 — 나아가는 중 · 멈춤 ·
  // 입력 대기 — 는 ReactiveMechanism 이 진다.
  registerAlgorithm<MatrixMulData>('matrixMul', matrixMulAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('matrixMulProjector', matrixMulProjector);
  for (const ir of matrixMulIRs) registerIR(ir.id, ir);
  registerView('matrix-mul-stage', matrixMulStageView);
  registerFacets([matrixMulFacet]);
}
