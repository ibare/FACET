/**
 * @ffacet/algorithm-prim-mst — 프림 최소 신장 트리 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { primMst, type PrimMstData, type PrimEdge } from './algorithm.js';
export { primMstProjector } from './projector.js';
export { primGrowIR, primMstIRs } from './irs.js';
export { primMstFacet } from './facet.js';
export { primMstDescription } from './description.js';
export {
  primMstStageView,
  type PrimStageGraph,
  type PrimStageSnapshot,
} from './prim-mst-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { primMst, type PrimMstData } from './algorithm.js';
import { primMstProjector } from './projector.js';
import { primMstIRs } from './irs.js';
import { primMstStageView } from './prim-mst-stage.js';
import { primMstFacet } from './facet.js';
import { primMstDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerPrimMst(): void {
  registerAlgorithm<PrimMstData>('primMst', primMst);
  registerProjector('primMstProjector', primMstProjector);
  for (const ir of primMstIRs) registerIR(ir.id, ir);
  registerView('prim-mst-stage', primMstStageView);
  registerFacets([primMstFacet]);
  registerDescription(primMstFacet.id, primMstDescription);
}
