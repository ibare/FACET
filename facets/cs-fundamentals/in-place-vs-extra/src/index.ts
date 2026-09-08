/**
 * @ffacet/algorithm-in-place-vs-extra — 제자리 정렬 조각(piece) facet 번들.
 *
 * 여섯 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export {
  inPlaceVsExtra,
  computeInPlaceVsExtraResult,
  type InPlaceVsExtraData,
} from './algorithm.js';
export { inPlaceVsExtraProjector } from './projector.js';
export { inPlaceVsExtraIRs } from './irs.js';
export { inPlaceVsExtraFacet } from './facet.js';
export { inPlaceVsExtraDescription } from './description.js';
export {
  inPlaceVsExtraStageView,
  type InPlaceVsExtraStageInit,
  type InPlaceVsExtraStageRound,
  type InPlaceVsExtraStageDone,
} from './in-place-vs-extra-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { inPlaceVsExtra, type InPlaceVsExtraData } from './algorithm.js';
import { inPlaceVsExtraProjector } from './projector.js';
import { inPlaceVsExtraIRs } from './irs.js';
import { inPlaceVsExtraFacet } from './facet.js';
import { inPlaceVsExtraDescription } from './description.js';
import { inPlaceVsExtraStageView } from './in-place-vs-extra-stage.js';

export function registerInPlaceVsExtra(): void {
  registerAlgorithm<InPlaceVsExtraData>('inPlaceVsExtra', inPlaceVsExtra, {
    mechanismKind: 'reactive',
  });
  registerProjector('inPlaceVsExtraProjector', inPlaceVsExtraProjector);
  for (const ir of inPlaceVsExtraIRs) registerIR(ir.id, ir);
  registerView('in-place-vs-extra-stage', inPlaceVsExtraStageView);
  registerFacets([inPlaceVsExtraFacet]);
  registerDescription(inPlaceVsExtraFacet.id, inPlaceVsExtraDescription);
}
