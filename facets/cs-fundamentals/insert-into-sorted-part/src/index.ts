/**
 * @ffacet/algorithm-insert-into-sorted-part — 조각(piece) facet 번들.
 *
 * "벌어지는 자리는 누군가 비켜서서 생긴다" 한 주장만 말하고 멈춘다. reactive
 * 메커니즘이라 mount 하면 스스로 재생한다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고
 * stage 가 `render` 하나로 산다. 어느 걸음의 화면이든 셈으로 얻으므로 컨트롤은 다시
 * 보기 + 띠다 (S-scene · S-piece).
 *
 * 등록은 호스트(playground 등) 가 `registerInsertIntoSortedPart()` 를 명시
 * 호출한다 — 이 파일은 import 만으로 아무것도 등록하지 않는다.
 */

export { insertIntoSortedPart, type InsertIntoSortedPartData } from './algorithm.js';
export {
  insertIntoSortedPartScene,
  type InsertIntoSortedPartScene,
  type InsertIntoSortedPartStep,
} from './scene.js';
export { insertIntoSortedPartIRs } from './irs.js';
export { insertIntoSortedPartFacet } from './facet.js';
export { insertIntoSortedPartStageView } from './insert-into-sorted-part-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { insertIntoSortedPart, type InsertIntoSortedPartData } from './algorithm.js';
import { insertIntoSortedPartScene } from './scene.js';
import { insertIntoSortedPartIRs } from './irs.js';
import { insertIntoSortedPartFacet } from './facet.js';
import { insertIntoSortedPartStageView } from './insert-into-sorted-part-stage.js';

/**
 * algorithm / scene / IR / view / facet 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 view 카탈로그를 조회하기 때문.
 */
export function registerInsertIntoSortedPart(): void {
  registerAlgorithm<InsertIntoSortedPartData>('insertIntoSortedPart', insertIntoSortedPart, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('insertIntoSortedPartScene', insertIntoSortedPartScene);
  for (const ir of insertIntoSortedPartIRs) registerIR(ir.id, ir);
  registerView('insert-into-sorted-part-stage', insertIntoSortedPartStageView);
  registerFacets([insertIntoSortedPartFacet]);
}
