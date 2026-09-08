/**
 * @ffacet/algorithm-halve-the-range — 구간 반분 조각(piece) facet 번들.
 *
 * 일곱에서 셋으로, 셋에서 하나로. 견줌 두 번이 후보의 폭을 어떻게 걷어 내는지
 * 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을 받지 않는다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { halveTheRange, type HalveTheRangeData } from './algorithm.js';
export { halveTheRangeProjector } from './projector.js';
export { halveTheRangeIRs } from './irs.js';
export { halveTheRangeFacet } from './facet.js';
export { halveTheRangeDescription } from './description.js';
export { halveTheRangeStageView, type HalveTheRangeStageInit } from './halve-the-range-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { halveTheRange, type HalveTheRangeData } from './algorithm.js';
import { halveTheRangeProjector } from './projector.js';
import { halveTheRangeIRs } from './irs.js';
import { halveTheRangeFacet } from './facet.js';
import { halveTheRangeDescription } from './description.js';
import { halveTheRangeStageView } from './halve-the-range-stage.js';

export function registerHalveTheRange(): void {
  registerAlgorithm<HalveTheRangeData>('halveTheRange', halveTheRange, {
    mechanismKind: 'reactive',
  });
  registerProjector('halveTheRangeProjector', halveTheRangeProjector);
  for (const ir of halveTheRangeIRs) registerIR(ir.id, ir);
  registerView('halve-the-range-stage', halveTheRangeStageView);
  registerFacets([halveTheRangeFacet]);
  registerDescription(halveTheRangeFacet.id, halveTheRangeDescription);
}
