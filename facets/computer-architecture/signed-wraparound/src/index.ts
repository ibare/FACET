/**
 * @ffacet/algorithm-signed-wraparound — 조각(piece) facet 번들.
 *
 * "가장 큰 수 다음은 무엇인가" 하나에 답하고 멈춘다. algorithm / 장면 설계 /
 * facet JSON / 전용 view (signed-wraparound-stage) 를 함께
 * 묶고 등록 헬퍼를 내준다. 등록 호출은 호스트 앱의 몫이다 (S-facet).
 */

export {
  signedWraparound,
  signedMin,
  signedMax,
  toBits,
  type SignedWraparoundData,
} from './algorithm.js';
export { signedWraparoundScene, carryOrder, nowValue } from './scene.js';
export type {
  SignedWraparoundScene,
  WraparoundCaption,
  WraparoundStep,
} from './scene.js';
export { signedWraparoundIRs } from './irs.js';
export { signedWraparoundFacet } from './facet.js';
export { signedWraparoundStageView } from './signed-wraparound-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { signedWraparound, type SignedWraparoundData } from './algorithm.js';
import { signedWraparoundScene } from './scene.js';
import { signedWraparoundIRs } from './irs.js';
import { signedWraparoundFacet } from './facet.js';
import { signedWraparoundStageView } from './signed-wraparound-stage.js';

/**
 * algorithm / 장면 설계 / IR / view / facet 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 facet 등록 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerSignedWraparound(): void {
  registerAlgorithm<SignedWraparoundData>('signedWraparound', signedWraparound, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('signedWraparoundScene', signedWraparoundScene);
  for (const ir of signedWraparoundIRs) registerIR(ir.id, ir);
  registerView('signed-wraparound-stage', signedWraparoundStageView);
  registerFacets([signedWraparoundFacet]);
}
