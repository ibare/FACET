/**
 * @ffacet/algorithm-insert-into-sorted-part — 조각(piece) facet 번들.
 *
 * "벌어지는 자리는 누군가 비켜서서 생긴다" 한 주장만 말하고 멈춘다. reactive
 * 메커니즘이라 mount 하면 스스로 재생하고, 컨트롤은 다시 보기 / 한 걸음 둘뿐이다
 * (S-piece).
 *
 * 등록은 호스트(playground 등) 가 `registerInsertIntoSortedPart()` 를 명시
 * 호출한다 — 이 파일은 import 만으로 아무것도 등록하지 않는다.
 */

export { insertIntoSortedPart, type InsertIntoSortedPartData } from './algorithm.js';
export { insertIntoSortedPartProjector } from './projector.js';
export { insertIntoSortedPartIRs } from './irs.js';
export { insertIntoSortedPartFacet } from './facet.js';
export { insertIntoSortedPartDescription } from './description.js';
export { insertIntoSortedPartStageView } from './insert-into-sorted-part-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { insertIntoSortedPart, type InsertIntoSortedPartData } from './algorithm.js';
import { insertIntoSortedPartProjector } from './projector.js';
import { insertIntoSortedPartIRs } from './irs.js';
import { insertIntoSortedPartFacet } from './facet.js';
import { insertIntoSortedPartDescription } from './description.js';
import { insertIntoSortedPartStageView } from './insert-into-sorted-part-stage.js';

/**
 * algorithm / projector / IR / view / facet / description 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 view 카탈로그를 조회하기 때문.
 */
export function registerInsertIntoSortedPart(): void {
  registerAlgorithm<InsertIntoSortedPartData>('insertIntoSortedPart', insertIntoSortedPart, {
    mechanismKind: 'reactive',
  });
  registerProjector('insertIntoSortedPartProjector', insertIntoSortedPartProjector);
  for (const ir of insertIntoSortedPartIRs) registerIR(ir.id, ir);
  registerView('insert-into-sorted-part-stage', insertIntoSortedPartStageView);
  registerFacets([insertIntoSortedPartFacet]);
  registerDescription(insertIntoSortedPartFacet.id, insertIntoSortedPartDescription);
}
