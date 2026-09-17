/**
 * @ffacet/algorithm-sieve — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { sieveAlgorithm, type SieveData } from './algorithm.js';
import { sieveProjector } from './projector.js';
import { sieveIRs } from './irs.js';
import { sieveStageView } from './sieve-stage.js';
import { sieveFacet } from './facet.js';

export { sieveAlgorithm, sieveProjector, sieveIRs, sieveStageView, sieveFacet };
export { runSieve, SIEVE_LIMIT_CHOICES } from './algorithm.js';
export { sieveImperativeIR } from './irs.js';
export { SIEVE_LIMIT_TICKS, SIEVE_COLS, SIEVE_MAX_ROWS } from './sieve-stage.js';
export type { SieveData, SieveRun, SieveVisit } from './algorithm.js';
export type { SieveStrikeFrame, SieveRevealFrame } from './sieve-stage.js';

export function registerSieve(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<SieveData>('sieve', sieveAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('sieveProjector', sieveProjector);
  for (const ir of sieveIRs) registerIR(ir.id, ir);
  registerView('sieve-stage', sieveStageView);
  registerFacets([sieveFacet]);
}
