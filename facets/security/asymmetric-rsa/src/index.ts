/**
 * @facet/algorithm-asymmetric-rsa — RSA (비대칭 암호) facet 번들.
 *
 * 시간 진행형 (ReactiveMechanism + auto-demo loop). mount 직후 (A) 키 생성 →
 * (B) 암호화 → (C) 복호화 한 호흡이 자동 재생된 뒤 waitForInput 으로 사용자
 * 액션을 대기한다. 컨트롤바는 next-p / next-q / 평문 m / replay /
 * speed-slider / toggle-reverse / reset.
 *
 * algorithm / projector / facet JSON / description / 전용 view (rsa-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  asymmetricRsa,
  type RsaFacetData,
  type RsaInputEvent,
  type RsaParams,
  type RsaPrimeId,
} from './algorithm.js';
export { asymmetricRsaProjector } from './projector.js';
export { asymmetricRsaIRs } from './irs.js';
export { asymmetricRsaFacet } from './facet.js';
export { asymmetricRsaDescription } from './description.js';
export { rsaStageView } from './rsa-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { asymmetricRsa, type RsaFacetData } from './algorithm.js';
import { asymmetricRsaProjector } from './projector.js';
import { asymmetricRsaIRs } from './irs.js';
import { asymmetricRsaFacet } from './facet.js';
import { asymmetricRsaDescription } from './description.js';
import { rsaStageView } from './rsa-stage.js';

export function registerAsymmetricRsa(): void {
  registerAlgorithm<RsaFacetData>('asymmetricRsa', asymmetricRsa, {
    mechanismKind: 'reactive',
  });
  registerProjector('asymmetricRsaProjector', asymmetricRsaProjector);
  for (const ir of asymmetricRsaIRs) registerIR(ir.id, ir);
  registerView('rsa-stage', rsaStageView);
  registerFacets([asymmetricRsaFacet]);
  registerDescription(asymmetricRsaFacet.id, asymmetricRsaDescription);
}
