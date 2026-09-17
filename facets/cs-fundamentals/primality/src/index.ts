/**
 * facet:primality 의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — `registerPrimality()` 를 부르는 것은
 * 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { primalityAlgorithm, type PrimalityData } from './algorithm.js';
import { primalityProjector } from './projector.js';
import { primalityIRs } from './irs.js';
import { primalityStageView } from './primality-stage.js';
import { primalityFacet } from './facet.js';

export type { PrimalityData, PrimalityFacts } from './algorithm.js';
export { primalityAlgorithm, examine, PRIMALITY_NS } from './algorithm.js';
export { primalityProjector } from './projector.js';
export { primalityImperativeIR, primalityIRs } from './irs.js';
export { primalityStageView } from './primality-stage.js';
export { primalityFacet } from './facet.js';

export function registerPrimality(): void {
  // 손잡이를 가진 완제품이라 reactive 다 — 수를 바꾸면 알고리즘이 그 입력을
  // 받아 처음부터 다시 판정한다.
  registerAlgorithm<PrimalityData>('primality', primalityAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('primalityProjector', primalityProjector);
  for (const ir of primalityIRs) registerIR(ir.id, ir);
  registerView('primality-stage', primalityStageView);
  registerFacets([primalityFacet]);
}
