/**
 * @ffacet/algorithm-greedy — 그리디 (활동 선택) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { greedy, type GreedyData } from './algorithm.js';
export { greedyProjector } from './projector.js';
export { activitySelectionIR, greedyIRs } from './irs.js';
export { greedyFacet } from './facet.js';
export { greedyStageView, type GreedyBarState } from './greedy-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { greedy, type GreedyData } from './algorithm.js';
import { greedyProjector } from './projector.js';
import { greedyIRs } from './irs.js';
import { greedyStageView } from './greedy-stage.js';
import { greedyFacet } from './facet.js';

/** algorithm / projector / IR / view / facet 등록 헬퍼. */
export function registerGreedy(): void {
  registerAlgorithm<GreedyData>('greedy', greedy);
  registerProjector('greedyProjector', greedyProjector);
  for (const ir of greedyIRs) registerIR(ir.id, ir);
  registerView('greedy-stage', greedyStageView);
  registerFacets([greedyFacet]);
}
