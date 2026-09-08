/**
 * @ffacet/algorithm-shift-on-remove — 삭제 이동 조각(piece) facet 번들.
 *
 * 한 주장만 말하는 조각이다. 일곱 걸음을 스스로 재생하고 멈추며, 그 뒤로는
 * 다시 보기와 한 걸음 외에 조작을 받지 않는다.
 *
 * `registerShiftOnRemove()` 는 호스트 앱이 부른다. 이 파일은 부수효과로
 * 스스로 등록하지 않는다 (S-facet).
 */

export { shiftOnRemove, type ShiftOnRemoveFacetData } from './algorithm.js';
export { shiftOnRemoveProjector } from './projector.js';
export { shiftOnRemoveIRs } from './irs.js';
export { shiftOnRemoveFacet } from './facet.js';
export { shiftOnRemoveDescription } from './description.js';
export { shiftOnRemoveStageView, type ShiftOnRemoveStageText } from './shift-on-remove-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { shiftOnRemove, type ShiftOnRemoveFacetData } from './algorithm.js';
import { shiftOnRemoveProjector } from './projector.js';
import { shiftOnRemoveIRs } from './irs.js';
import { shiftOnRemoveFacet } from './facet.js';
import { shiftOnRemoveDescription } from './description.js';
import { shiftOnRemoveStageView } from './shift-on-remove-stage.js';

export function registerShiftOnRemove(): void {
  registerAlgorithm<ShiftOnRemoveFacetData>('shiftOnRemove', shiftOnRemove, {
    mechanismKind: 'reactive',
  });
  registerProjector('shiftOnRemoveProjector', shiftOnRemoveProjector);
  for (const ir of shiftOnRemoveIRs) registerIR(ir.id, ir);
  registerView('shift-on-remove-stage', shiftOnRemoveStageView);
  registerFacets([shiftOnRemoveFacet]);
  registerDescription(shiftOnRemoveFacet.id, shiftOnRemoveDescription);
}
