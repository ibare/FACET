/**
 * @ffacet/algorithm-dfs — 깊이 우선 탐색 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { dfs, type DfsData } from './algorithm.js';
export { dfsProjector } from './projector.js';
export { dfsRecursiveIR, dfsIRs } from './irs.js';
export { dfsFacet } from './facet.js';
export { dfsDescription } from './description.js';
export {
  dfsStageView,
  type DfsNodeState,
  type DfsEdgeSettled,
  type DfsEdgeActive,
} from './dfs-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { dfs, type DfsData } from './algorithm.js';
import { dfsProjector } from './projector.js';
import { dfsIRs } from './irs.js';
import { dfsStageView } from './dfs-stage.js';
import { dfsFacet } from './facet.js';
import { dfsDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerDfs(): void {
  registerAlgorithm<DfsData>('dfs', dfs);
  registerProjector('dfsProjector', dfsProjector);
  for (const ir of dfsIRs) registerIR(ir.id, ir);
  registerView('dfs-stage', dfsStageView);
  registerFacets([dfsFacet]);
  registerDescription(dfsFacet.id, dfsDescription);
}
