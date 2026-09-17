/**
 * @ffacet/algorithm-unrepresentable-fraction — 끝나지 않는 소수 조각(piece) 번들.
 *
 * 한 주장을 말하는 조각이다. 자동으로 재생되고 멈추며, 다시 보기와 끌어 보는 띠를
 * 받는다. ReactiveMechanism 이라 스스로 재생을 시작하고 걸음 간격도 스스로
 * 정한다 (ctx.sleep). 코드 패널은 두지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — 이벤트가 `UnrepresentableFractionScene` 으로 쌓이고
 * stage 의 `render` 하나가 그 장면을 통째로 세운다. 그래서 스크럽 띠로 아무
 * 걸음에나 갈 수 있다 (S-scene).
 *
 * 등록 호출은 호스트 앱의 몫이다 — 이 모듈은 사이드 이펙트로 자기를 등록하지
 * 않는다 (S-facet).
 */

export {
  unrepresentableFraction,
  fractionDecimalText,
  float32Expansion,
  type UnrepresentableFractionData,
} from './algorithm.js';
export {
  unrepresentableFractionScene,
  vesselDigits,
  keepOf,
  flipIndexOf,
  patternOf,
  digitAt,
  nextSlot,
} from './scene.js';
export type {
  FractionLoop,
  UnrepresentableFractionScene,
  UnrepresentableFractionStep,
} from './scene.js';
export { unrepresentableFractionIRs } from './irs.js';
export { unrepresentableFractionFacet } from './facet.js';
export { unrepresentableFractionDescription } from './description.js';
export { unrepresentableFractionStageView } from './unrepresentable-fraction-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { unrepresentableFraction, type UnrepresentableFractionData } from './algorithm.js';
import { unrepresentableFractionScene } from './scene.js';
import { unrepresentableFractionIRs } from './irs.js';
import { unrepresentableFractionFacet } from './facet.js';
import { unrepresentableFractionDescription } from './description.js';
import { unrepresentableFractionStageView } from './unrepresentable-fraction-stage.js';

/**
 * 등록 헬퍼. 순서는 S-facet 표준 (Algorithm → Scene → IR → View → Facets
 * → Description). 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type
 * 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerUnrepresentableFraction(): void {
  registerAlgorithm<UnrepresentableFractionData>('unrepresentableFraction', unrepresentableFraction, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('unrepresentableFractionScene', unrepresentableFractionScene);
  for (const ir of unrepresentableFractionIRs) registerIR(ir.id, ir);
  registerView('unrepresentable-fraction-stage', unrepresentableFractionStageView);
  registerFacets([unrepresentableFractionFacet]);
  registerDescription(unrepresentableFractionFacet.id, unrepresentableFractionDescription);
}
