/**
 * @ffacet/algorithm-select-min-each-pass — 조각(piece) facet.
 *
 * 등록은 호스트가 부른다. 이 모듈이 사이드 이펙트로 스스로 등록하지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

export { selectMinEachPass, type SelectMinEachPassData } from './algorithm.js';
export {
  selectMinEachPassScene,
  type SelectMinEachPassScene,
  type SelectMinEachPassCaption,
  type SelectMinEachPassStep,
} from './scene.js';
export { selectMinEachPassStageView } from './select-min-each-pass-stage.js';
export { selectMinEachPassIRs } from './irs.js';
export { selectMinEachPassFacet } from './facet.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { selectMinEachPass, type SelectMinEachPassData } from './algorithm.js';
import { selectMinEachPassScene } from './scene.js';
import { selectMinEachPassStageView } from './select-min-each-pass-stage.js';
import { selectMinEachPassIRs } from './irs.js';
import { selectMinEachPassFacet } from './facet.js';

/** algorithm/장면/IR/view/facet 등록 헬퍼. */
export function registerSelectMinEachPass(): void {
  registerAlgorithm<SelectMinEachPassData>('selectMinEachPass', selectMinEachPass, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('selectMinEachPassScene', selectMinEachPassScene);
  for (const ir of selectMinEachPassIRs) registerIR(ir.id, ir);
  registerView('select-min-each-pass-stage', selectMinEachPassStageView);
  registerFacets([selectMinEachPassFacet]);
}
