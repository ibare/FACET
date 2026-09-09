/**
 * @ffacet/algorithm-branch-and-bound — 분기 한정 (0/1 배낭) 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { branchAndBound, type BranchAndBoundData } from './algorithm.js';
export { branchAndBoundProjector } from './projector.js';
export { knapsackBoundIR, branchAndBoundIRs } from './irs.js';
export { branchAndBoundFacet } from './facet.js';
export { branchAndBoundDescription } from './description.js';
export {
  branchAndBoundStageView,
  type BranchNode,
  type BranchNodeState,
} from './branch-and-bound-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { branchAndBound, type BranchAndBoundData } from './algorithm.js';
import { branchAndBoundProjector } from './projector.js';
import { branchAndBoundIRs } from './irs.js';
import { branchAndBoundStageView } from './branch-and-bound-stage.js';
import { branchAndBoundFacet } from './facet.js';
import { branchAndBoundDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerBranchAndBound(): void {
  registerAlgorithm<BranchAndBoundData>('branchAndBound', branchAndBound);
  registerProjector('branchAndBoundProjector', branchAndBoundProjector);
  for (const ir of branchAndBoundIRs) registerIR(ir.id, ir);
  registerView('branch-and-bound-stage', branchAndBoundStageView);
  registerFacets([branchAndBoundFacet]);
  registerDescription(branchAndBoundFacet.id, branchAndBoundDescription);
}
