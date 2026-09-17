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
export { shiftOnInsertScene, type ShiftOnInsertScene } from './scene.js';
export { shiftOnInsertIRs } from './irs.js';
export { shiftOnInsertFacet } from './facet.js';
export { shiftOnInsertStageView } from './shift-on-insert-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { shiftOnInsert, type ShiftOnInsertData } from './algorithm.js';
import { shiftOnInsertScene } from './scene.js';
import { shiftOnInsertIRs } from './irs.js';
import { shiftOnInsertFacet } from './facet.js';
import { shiftOnInsertStageView } from './shift-on-insert-stage.js';

/**
 * algorithm / scene / IR / view / facet 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 view 카탈로그를 조회하기 때문.
 */
export function registerShiftOnInsert(): void {
  registerAlgorithm<ShiftOnInsertData>('shiftOnInsert', shiftOnInsert, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('shiftOnInsertScene', shiftOnInsertScene);
  for (const ir of shiftOnInsertIRs) registerIR(ir.id, ir);
  registerView('shift-on-insert-stage', shiftOnInsertStageView);
  registerFacets([shiftOnInsertFacet]);
}
