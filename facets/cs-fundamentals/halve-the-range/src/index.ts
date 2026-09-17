/**
 * @ffacet/algorithm-halve-the-range — 구간 반분 조각(piece) facet 번들.
 *
 * 일곱에서 셋으로, 셋에서 하나로. 견줌 두 번이 후보의 폭을 어떻게 걷어 내는지
 * 자동으로 재생하고 멈춘다. 다시 보기와 자취 띠 외에는 조작을 받지 않는다.
 *
 * 화면은 장면(Scene) 으로 만들어진다 — projector 자리를 `scene.ts` 가 잇는다
 * (S-scene).
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { halveTheRange, midOf, type HalveTheRangeData } from './algorithm.js';
export {
  halveTheRangeScene,
  remainingOf,
  sunkSlots,
  type HalveTheRangeCaption,
  type HalveTheRangeScene,
  type HalveTheRangeSpan,
  type HalveTheRangeStep,
  type HalveTheRangeSweep,
} from './scene.js';
export { halveTheRangeIRs } from './irs.js';
export { halveTheRangeFacet } from './facet.js';
export { halveTheRangeStageView } from './halve-the-range-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { halveTheRange, type HalveTheRangeData } from './algorithm.js';
import { halveTheRangeScene } from './scene.js';
import { halveTheRangeIRs } from './irs.js';
import { halveTheRangeFacet } from './facet.js';
import { halveTheRangeStageView } from './halve-the-range-stage.js';

export function registerHalveTheRange(): void {
  registerAlgorithm<HalveTheRangeData>('halveTheRange', halveTheRange, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('halveTheRangeScene', halveTheRangeScene);
  for (const ir of halveTheRangeIRs) registerIR(ir.id, ir);
  registerView('halve-the-range-stage', halveTheRangeStageView);
  registerFacets([halveTheRangeFacet]);
}
