/**
 * @ffacet/algorithm-shift-on-remove — 삭제 이동 조각(piece) facet 번들.
 *
 * 한 주장만 말하는 조각이다. 걸음을 스스로 재생하고 멈추며, 그 뒤로는 다시 보기와
 * 스크럽 띠 외에 조작을 받지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 *
 * `registerShiftOnRemove()` 는 호스트 앱이 부른다. 이 파일은 부수효과로
 * 스스로 등록하지 않는다 (S-facet).
 */

export { shiftOnRemove, type ShiftOnRemoveFacetData } from './algorithm.js';
export { shiftOnRemoveScene, type ShiftOnRemoveScene } from './scene.js';
export { shiftOnRemoveIRs } from './irs.js';
export { shiftOnRemoveFacet } from './facet.js';
export { shiftOnRemoveStageView } from './shift-on-remove-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { shiftOnRemove, type ShiftOnRemoveFacetData } from './algorithm.js';
import { shiftOnRemoveScene } from './scene.js';
import { shiftOnRemoveIRs } from './irs.js';
import { shiftOnRemoveFacet } from './facet.js';
import { shiftOnRemoveStageView } from './shift-on-remove-stage.js';

export function registerShiftOnRemove(): void {
  registerAlgorithm<ShiftOnRemoveFacetData>('shiftOnRemove', shiftOnRemove, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('shiftOnRemoveScene', shiftOnRemoveScene);
  for (const ir of shiftOnRemoveIRs) registerIR(ir.id, ir);
  registerView('shift-on-remove-stage', shiftOnRemoveStageView);
  registerFacets([shiftOnRemoveFacet]);
}
