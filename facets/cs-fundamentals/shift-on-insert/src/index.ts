/**
 * @ffacet/algorithm-shift-on-insert — 조각(piece) facet 번들.
 *
 * "가운데에 넣으면 뒤가 밀린다" 한 주장만 말하고 멈춘다. reactive 메커니즘이라
 * mount 하면 스스로 재생하고, 컨트롤은 다시 보기 / 한 걸음 둘뿐이다 (S-piece).
 *
 * 등록은 호스트(playground 등) 가 `registerShiftOnInsert()` 를 명시 호출한다 —
 * 이 파일은 import 만으로 아무것도 등록하지 않는다.
 */

export { shiftOnInsert, type ShiftOnInsertData } from './algorithm.js';
export { shiftOnInsertProjector } from './projector.js';
export { shiftOnInsertIRs } from './irs.js';
export { shiftOnInsertFacet } from './facet.js';
export { shiftOnInsertDescription } from './description.js';
export { shiftOnInsertStageView, type ShiftStageData } from './shift-on-insert-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { shiftOnInsert, type ShiftOnInsertData } from './algorithm.js';
import { shiftOnInsertProjector } from './projector.js';
import { shiftOnInsertIRs } from './irs.js';
import { shiftOnInsertFacet } from './facet.js';
import { shiftOnInsertDescription } from './description.js';
import { shiftOnInsertStageView } from './shift-on-insert-stage.js';

/**
 * algorithm / projector / IR / view / facet / description 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 view 카탈로그를 조회하기 때문.
 */
export function registerShiftOnInsert(): void {
  registerAlgorithm<ShiftOnInsertData>('shiftOnInsert', shiftOnInsert, {
    mechanismKind: 'reactive',
  });
  registerProjector('shiftOnInsertProjector', shiftOnInsertProjector);
  for (const ir of shiftOnInsertIRs) registerIR(ir.id, ir);
  registerView('shift-on-insert-stage', shiftOnInsertStageView);
  registerFacets([shiftOnInsertFacet]);
  registerDescription(shiftOnInsertFacet.id, shiftOnInsertDescription);
}
