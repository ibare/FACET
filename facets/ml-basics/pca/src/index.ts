/**
 * @ffacet/algorithm-pca — 주성분 분석 (PCA) 완제품 번들.
 *
 * 입력 반응형 (`ReactiveMechanism`). 마운트 직후 원래 단위로 한 호흡 자동
 * 시연하고 그 뒤로는 손잡이 둘을 기다린다 — 축의 단위(그대로 / 표준화)와
 * 사영할 축(제1 / 제2). 재생 · 멈춤 · 한 걸음 · 되감기는 메커니즘이 진다.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 view
 * (`pca-stage`) 를 함께 번들하고 등록 헬퍼를 제공한다.
 */

export { pca, type PcaData, type PcaInputEvent, type PcaPoint } from './algorithm.js';
export { pcaProjector } from './projector.js';
export { pcaIRs, pcaPowerIterationIR } from './irs.js';
export { pcaFacet } from './facet.js';
export { pcaDescription } from './description.js';
export {
  pcaStageView,
  type PcaAxis,
  type PcaCovariance,
  type PcaFrame,
  type PcaLedgerRow,
  type PcaStretch,
  type PcaTurn,
  type PcaVector,
} from './pca-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { pca, type PcaData } from './algorithm.js';
import { pcaProjector } from './projector.js';
import { pcaIRs } from './irs.js';
import { pcaFacet } from './facet.js';
import { pcaDescription } from './description.js';
import { pcaStageView } from './pca-stage.js';

export function registerPca(): void {
  registerAlgorithm<PcaData>('pca', pca, { mechanismKind: 'reactive' });
  registerProjector('pcaProjector', pcaProjector);
  for (const ir of pcaIRs) registerIR(ir.id, ir);
  registerView('pca-stage', pcaStageView);
  registerFacets([pcaFacet]);
  registerDescription(pcaFacet.id, pcaDescription);
}
