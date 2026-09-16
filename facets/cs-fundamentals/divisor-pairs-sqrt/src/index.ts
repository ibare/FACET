/**
 * 약수의 짝 조각의 등록 진입점.
 *
 * 화면은 장면(Scene) 방식이라 어느 걸음이든 셈으로 얻는다 — 띠를 끌어 되짚어도
 * 같은 화면이 선다.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 파일이 사이드 이펙트로 스스로 부르지 않는다
 * (S-facet).
 */

export {
  divisorPairsSqrtAlgorithm,
  readN,
  sqrtLimit,
  type DivisorPairsSqrtData,
} from './algorithm.js';
export { divisorPairsSqrtScene, type DivisorPairsSqrtScene } from './scene.js';
export { divisorPairsSqrtIRs } from './irs.js';
export { divisorPairsSqrtFacet } from './facet.js';
export { divisorPairsSqrtDescription } from './description.js';
export { divisorPairsSqrtStageView } from './divisor-pairs-sqrt-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { divisorPairsSqrtAlgorithm, type DivisorPairsSqrtData } from './algorithm.js';
import { divisorPairsSqrtScene } from './scene.js';
import { divisorPairsSqrtIRs } from './irs.js';
import { divisorPairsSqrtFacet } from './facet.js';
import { divisorPairsSqrtDescription } from './description.js';
import { divisorPairsSqrtStageView } from './divisor-pairs-sqrt-stage.js';

export function registerDivisorPairsSqrt(): void {
  registerAlgorithm<DivisorPairsSqrtData>('divisorPairsSqrt', divisorPairsSqrtAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('divisorPairsSqrtScene', divisorPairsSqrtScene);
  for (const ir of divisorPairsSqrtIRs) registerIR(ir.id, ir);
  registerView('divisor-pairs-sqrt-stage', divisorPairsSqrtStageView);
  registerFacets([divisorPairsSqrtFacet]);
  registerDescription(divisorPairsSqrtFacet.id, divisorPairsSqrtDescription);
}
