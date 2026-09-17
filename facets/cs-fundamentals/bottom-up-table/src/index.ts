/**
 * @ffacet/algorithm-bottom-up-table — 상향식 표 채우기 조각 번들.
 *
 * reactive 조각. mount 하면 `T[0..5]` 를 왼쪽에서 오른쪽으로 채우며, 칸마다
 * 바로 앞 두 칸에서 화살이 뻗어 나와 그 칸으로 모인다. 재귀 호출은 0 번이다.
 *
 * 화면은 장면(Scene) 방식이다 — 이벤트가 `BottomUpTableScene` 으로 쌓이고 stage 의
 * `render` 하나가 그 장면을 통째로 세운다. 그래서 스크럽 띠로 아무 걸음에나 갈 수
 * 있다 (S-scene).
 *
 * `register*` 를 사이드 이펙트로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

export { bottomUpTable, bottomUpTableCellCount, type BottomUpTableData } from './algorithm.js';
export { bottomUpTableScene } from './scene.js';
export type { BottomUpCell, BottomUpStep, BottomUpTableScene } from './scene.js';
export { bottomUpTableIRs } from './irs.js';
export { bottomUpTableFacet } from './facet.js';
export { bottomUpTableStageView } from './bottom-up-table-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { bottomUpTable, type BottomUpTableData } from './algorithm.js';
import { bottomUpTableScene } from './scene.js';
import { bottomUpTableIRs } from './irs.js';
import { bottomUpTableFacet } from './facet.js';
import { bottomUpTableStageView } from './bottom-up-table-stage.js';

/**
 * 등록 헬퍼. 순서는 S-facet 표준 (Algorithm → Scene → IR → View → Facets).
 * 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type
 * 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerBottomUpTable(): void {
  registerAlgorithm<BottomUpTableData>('bottomUpTable', bottomUpTable, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('bottomUpTableScene', bottomUpTableScene);
  for (const ir of bottomUpTableIRs) registerIR(ir.id, ir);
  registerView('bottom-up-table-stage', bottomUpTableStageView);
  registerFacets([bottomUpTableFacet]);
}
