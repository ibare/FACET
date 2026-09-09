/**
 * @ffacet/algorithm-topological-sort — 위상 정렬 (칸 알고리즘) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 *
 * `computeTopologicalSortResult` 는 `registerAlgorithm` 의 `computeResult` 로
 * 넘기지 않는다 — 그 자리는 "같은 모양의 최종 데이터" 를 돌려주는 goal-preview
 * 용이고, 이쪽이 돌려주는 것은 차례와 고리 여부라는 다른 모양이다. 검사와
 * 호스트가 대조용으로만 쓴다.
 */

export {
  topologicalSort,
  computeTopologicalSortResult,
  type TopologicalSortData,
  type TopologicalSortEdge,
} from './algorithm.js';
export { topologicalSortProjector } from './projector.js';
export { topologicalKahnIR, topologicalSortIRs } from './irs.js';
export { topologicalSortFacet } from './facet.js';
export { topologicalSortDescription } from './description.js';
export {
  topologicalSortStageView,
  type TopologicalSortNodeState,
  type TopologicalSortEdgeState,
} from './topological-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { topologicalSort, type TopologicalSortData } from './algorithm.js';
import { topologicalSortProjector } from './projector.js';
import { topologicalSortIRs } from './irs.js';
import { topologicalSortStageView } from './topological-sort-stage.js';
import { topologicalSortFacet } from './facet.js';
import { topologicalSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerTopologicalSort(): void {
  registerAlgorithm<TopologicalSortData>('topologicalSort', topologicalSort);
  registerProjector('topologicalSortProjector', topologicalSortProjector);
  for (const ir of topologicalSortIRs) registerIR(ir.id, ir);
  registerView('topological-sort-stage', topologicalSortStageView);
  registerFacets([topologicalSortFacet]);
  registerDescription(topologicalSortFacet.id, topologicalSortDescription);
}
