/**
 * @ffacet/algorithm-out-of-bounds — 경계 밖 접근 조각(piece) facet 번들.
 *
 * 여덟 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { outOfBounds, type OutOfBoundsData } from './algorithm.js';
export { outOfBoundsProjector } from './projector.js';
export { outOfBoundsIRs } from './irs.js';
export { outOfBoundsFacet } from './facet.js';
export { outOfBoundsDescription } from './description.js';
export { outOfBoundsStageView, type OutOfBoundsStageInit } from './out-of-bounds-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { outOfBounds, type OutOfBoundsData } from './algorithm.js';
import { outOfBoundsProjector } from './projector.js';
import { outOfBoundsIRs } from './irs.js';
import { outOfBoundsFacet } from './facet.js';
import { outOfBoundsDescription } from './description.js';
import { outOfBoundsStageView } from './out-of-bounds-stage.js';

export function registerOutOfBounds(): void {
  registerAlgorithm<OutOfBoundsData>('outOfBounds', outOfBounds, {
    mechanismKind: 'reactive',
  });
  registerProjector('outOfBoundsProjector', outOfBoundsProjector);
  for (const ir of outOfBoundsIRs) registerIR(ir.id, ir);
  registerView('out-of-bounds-stage', outOfBoundsStageView);
  registerFacets([outOfBoundsFacet]);
  registerDescription(outOfBoundsFacet.id, outOfBoundsDescription);
}
