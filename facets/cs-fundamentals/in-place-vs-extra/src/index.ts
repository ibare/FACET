/**
 * @ffacet/algorithm-in-place-vs-extra — 제자리 정렬 조각(piece) facet 번들.
 *
 * 여섯 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 스크럽 띠 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다. 화면은 명령이 아니라
 * 장면으로 만들어지므로 띠를 끌어 어느 걸음으로든 곧장 갈 수 있다 (S-scene).
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export {
  inPlaceVsExtra,
  computeInPlaceVsExtraResult,
  type InPlaceVsExtraData,
} from './algorithm.js';
export {
  inPlaceVsExtraScene,
  extraCellsOf,
  copiedValuesOf,
  takenFlagsOf,
  type InPlaceVsExtraScene,
  type InPlaceVsExtraLaneKey,
  type InPlaceVsExtraStep,
  type InPlaceVsExtraCaption,
} from './scene.js';
export { inPlaceVsExtraIRs } from './irs.js';
export { inPlaceVsExtraFacet } from './facet.js';
export { inPlaceVsExtraStageView } from './in-place-vs-extra-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { inPlaceVsExtra, type InPlaceVsExtraData } from './algorithm.js';
import { inPlaceVsExtraScene } from './scene.js';
import { inPlaceVsExtraIRs } from './irs.js';
import { inPlaceVsExtraFacet } from './facet.js';
import { inPlaceVsExtraStageView } from './in-place-vs-extra-stage.js';

export function registerInPlaceVsExtra(): void {
  registerAlgorithm<InPlaceVsExtraData>('inPlaceVsExtra', inPlaceVsExtra, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('inPlaceVsExtraScene', inPlaceVsExtraScene);
  for (const ir of inPlaceVsExtraIRs) registerIR(ir.id, ir);
  registerView('in-place-vs-extra-stage', inPlaceVsExtraStageView);
  registerFacets([inPlaceVsExtraFacet]);
}
