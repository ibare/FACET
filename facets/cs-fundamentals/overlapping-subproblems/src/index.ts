/**
 * @ffacet/algorithm-overlapping-subproblems — 중복 부분 문제 조각 번들.
 *
 * reactive 조각. mount 하면 `f(5)` 를 정의 그대로 펼치며, 같은 항이 다시
 * 나타날 때마다 그 자리에 몇 번째인지를 남기고 이름 선반에 조각을 쌓는다.
 *
 * 화면은 **장면(Scene)** 방식이다 — 이벤트를 상태로 옮기고 그 상태에서 화면을
 * 만든다. 그래서 어느 걸음으로든 곧장 갈 수 있고 컨트롤바에 스크럽 띠가 선다
 * (S-scene / S-piece).
 *
 * `register*` 를 사이드 이펙트로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

export {
  overlappingSubproblems,
  expandFibCalls,
  readTermCount,
  type OverlappingSubproblemsData,
  type FibCall,
} from './algorithm.js';
export {
  overlappingSubproblemsScene,
  type OverlappingSubproblemsScene,
  type OverlappingSubproblemsMark,
  type CallSummary,
  type Tally,
} from './scene.js';
export { overlappingSubproblemsIRs } from './irs.js';
export { overlappingSubproblemsFacet } from './facet.js';
export { overlappingSubproblemsStageView } from './overlapping-subproblems-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { overlappingSubproblems, type OverlappingSubproblemsData } from './algorithm.js';
import { overlappingSubproblemsScene } from './scene.js';
import { overlappingSubproblemsIRs } from './irs.js';
import { overlappingSubproblemsFacet } from './facet.js';
import { overlappingSubproblemsStageView } from './overlapping-subproblems-stage.js';

/**
 * 등록 헬퍼. 순서는 S-facet 표준 (Algorithm → Scene → IR → View → Facets).
 * 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type
 * 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerOverlappingSubproblems(): void {
  registerAlgorithm<OverlappingSubproblemsData>('overlappingSubproblems', overlappingSubproblems, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('overlappingSubproblemsScene', overlappingSubproblemsScene);
  for (const ir of overlappingSubproblemsIRs) registerIR(ir.id, ir);
  registerView('overlapping-subproblems-stage', overlappingSubproblemsStageView);
  registerFacets([overlappingSubproblemsFacet]);
}
