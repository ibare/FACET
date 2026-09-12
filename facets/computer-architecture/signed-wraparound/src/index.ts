/**
 * @ffacet/algorithm-signed-wraparound — 조각(piece) facet 번들.
 *
 * "가장 큰 수 다음은 무엇인가" 하나에 답하고 멈춘다. algorithm / projector /
 * facet JSON / description / 전용 view (signed-wraparound-stage) 를 함께
 * 묶고 등록 헬퍼를 내준다. 등록 호출은 호스트 앱의 몫이다 (S-facet).
 */

export {
  signedWraparound,
  signedMin,
  signedMax,
  toBits,
  type SignedWraparoundData,
} from './algorithm.js';
export { signedWraparoundProjector } from './projector.js';
export { signedWraparoundIRs } from './irs.js';
export { signedWraparoundFacet } from './facet.js';
export { signedWraparoundDescription } from './description.js';
export { signedWraparoundStageView, type WraparoundStep } from './signed-wraparound-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { signedWraparound, type SignedWraparoundData } from './algorithm.js';
import { signedWraparoundProjector } from './projector.js';
import { signedWraparoundIRs } from './irs.js';
import { signedWraparoundFacet } from './facet.js';
import { signedWraparoundDescription } from './description.js';
import { signedWraparoundStageView } from './signed-wraparound-stage.js';

/**
 * algorithm / projector / IR / view / facet / description 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 facet 등록 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerSignedWraparound(): void {
  registerAlgorithm<SignedWraparoundData>('signedWraparound', signedWraparound, {
    mechanismKind: 'reactive',
  });
  registerProjector('signedWraparoundProjector', signedWraparoundProjector);
  for (const ir of signedWraparoundIRs) registerIR(ir.id, ir);
  registerView('signed-wraparound-stage', signedWraparoundStageView);
  registerFacets([signedWraparoundFacet]);
  registerDescription(signedWraparoundFacet.id, signedWraparoundDescription);
}
