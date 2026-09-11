/**
 * 약수의 짝 조각의 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 파일이 사이드 이펙트로 스스로 부르지 않는다
 * (S-facet).
 */

export {
  divisorPairsSqrtAlgorithm,
  type DivisorPairsSqrtData,
} from './algorithm.js';
export { divisorPairsSqrtProjector } from './projector.js';
export { divisorPairsSqrtIRs } from './irs.js';
export { divisorPairsSqrtFacet } from './facet.js';
export { divisorPairsSqrtDescription } from './description.js';
export { divisorPairsSqrtStageView } from './divisor-pairs-sqrt-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { divisorPairsSqrtAlgorithm, type DivisorPairsSqrtData } from './algorithm.js';
import { divisorPairsSqrtProjector } from './projector.js';
import { divisorPairsSqrtIRs } from './irs.js';
import { divisorPairsSqrtFacet } from './facet.js';
import { divisorPairsSqrtDescription } from './description.js';
import { divisorPairsSqrtStageView } from './divisor-pairs-sqrt-stage.js';

export function registerDivisorPairsSqrt(): void {
  registerAlgorithm<DivisorPairsSqrtData>('divisorPairsSqrt', divisorPairsSqrtAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('divisorPairsSqrtProjector', divisorPairsSqrtProjector);
  for (const ir of divisorPairsSqrtIRs) registerIR(ir.id, ir);
  registerView('divisor-pairs-sqrt-stage', divisorPairsSqrtStageView);
  registerFacets([divisorPairsSqrtFacet]);
  registerDescription(divisorPairsSqrtFacet.id, divisorPairsSqrtDescription);
}
