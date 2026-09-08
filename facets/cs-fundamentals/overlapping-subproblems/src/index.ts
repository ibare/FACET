/**
 * @ffacet/algorithm-overlapping-subproblems — 중복 부분 문제 조각 번들.
 *
 * reactive 조각. mount 하면 `f(5)` 를 정의 그대로 펼치며, 같은 항이 다시
 * 나타날 때마다 그 자리에 몇 번째인지를 남기고 이름 선반에 조각을 쌓는다.
 *
 * `register*` 를 사이드 이펙트로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

export {
  overlappingSubproblems,
  type OverlappingSubproblemsData,
} from './algorithm.js';
export { overlappingSubproblemsProjector } from './projector.js';
export { overlappingSubproblemsIRs } from './irs.js';
export { overlappingSubproblemsFacet } from './facet.js';
export { overlappingSubproblemsDescription } from './description.js';
export { overlappingSubproblemsStageView } from './overlapping-subproblems-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { overlappingSubproblems, type OverlappingSubproblemsData } from './algorithm.js';
import { overlappingSubproblemsProjector } from './projector.js';
import { overlappingSubproblemsIRs } from './irs.js';
import { overlappingSubproblemsFacet } from './facet.js';
import { overlappingSubproblemsDescription } from './description.js';
import { overlappingSubproblemsStageView } from './overlapping-subproblems-stage.js';

/**
 * 등록 헬퍼. 순서는 S-facet 표준 (Algorithm → Projector → IR → View → Facets
 * → Description). 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type
 * 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerOverlappingSubproblems(): void {
  registerAlgorithm<OverlappingSubproblemsData>('overlappingSubproblems', overlappingSubproblems, {
    mechanismKind: 'reactive',
  });
  registerProjector('overlappingSubproblemsProjector', overlappingSubproblemsProjector);
  for (const ir of overlappingSubproblemsIRs) registerIR(ir.id, ir);
  registerView('overlapping-subproblems-stage', overlappingSubproblemsStageView);
  registerFacets([overlappingSubproblemsFacet]);
  registerDescription(overlappingSubproblemsFacet.id, overlappingSubproblemsDescription);
}
