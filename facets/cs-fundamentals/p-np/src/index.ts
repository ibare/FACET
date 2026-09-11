/**
 * @ffacet/algorithm-p-np — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { pNpAlgorithm, type PNpData } from './algorithm.js';
import { pNpProjector } from './projector.js';
import { pNpIRs } from './irs.js';
import { pNpStageView } from './p-np-stage.js';
import { pNpFacet } from './facet.js';
import { pNpDescription } from './description.js';

export { pNpAlgorithm, pNpProjector, pNpIRs, pNpStageView, pNpFacet, pNpDescription };
export { computePNpResult, P_NP_N_CHOICES, P_NP_SWEEP_STEPS } from './algorithm.js';
export { pNpImperativeIR } from './irs.js';
export {
  P_NP_N_TICKS,
  P_NP_GRID_COLS,
  P_NP_SHEET,
  P_NP_CAPACITY,
} from './p-np-stage.js';
export type { PNpData, PNpCandidate, PNpRound } from './algorithm.js';
export type {
  PNpProblemFrame,
  PNpSumFrame,
  PNpVerdictFrame,
  PNpSweepFrame,
} from './p-np-stage.js';

export function registerPNp(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<PNpData>('pNp', pNpAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('pNpProjector', pNpProjector);
  for (const ir of pNpIRs) registerIR(ir.id, ir);
  registerView('p-np-stage', pNpStageView);
  registerFacets([pNpFacet]);
  registerDescription(pNpFacet.id, pNpDescription);
}
