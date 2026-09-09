/**
 * @ffacet/algorithm-backtracking — 백트래킹 (4-퀸 전수 탐색) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { backtracking, type BacktrackingData } from './algorithm.js';
export { backtrackingProjector } from './projector.js';
export { nQueensBacktrackIR, backtrackingIRs } from './irs.js';
export { backtrackingFacet } from './facet.js';
export { backtrackingDescription } from './description.js';
export { backtrackingStageView } from './backtracking-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { backtracking, type BacktrackingData } from './algorithm.js';
import { backtrackingProjector } from './projector.js';
import { backtrackingIRs } from './irs.js';
import { backtrackingStageView } from './backtracking-stage.js';
import { backtrackingFacet } from './facet.js';
import { backtrackingDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerBacktracking(): void {
  registerAlgorithm<BacktrackingData>('backtracking', backtracking);
  registerProjector('backtrackingProjector', backtrackingProjector);
  for (const ir of backtrackingIRs) registerIR(ir.id, ir);
  registerView('backtracking-stage', backtrackingStageView);
  registerFacets([backtrackingFacet]);
  registerDescription(backtrackingFacet.id, backtrackingDescription);
}
