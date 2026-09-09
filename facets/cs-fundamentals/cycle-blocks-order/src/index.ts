/**
 * @ffacet/algorithm-cycle-blocks-order — 조각(piece) facet 등록 진입점.
 *
 * 호출 책임은 호스트에 있다. 이 파일은 사이드 이펙트로 등록하지 않는다 (S-facet).
 */

export {
  cycleBlocksOrder,
  type CycleBlocksOrderData,
  type CycleBlocksOrderEdge,
} from './algorithm.js';
export { cycleBlocksOrderProjector } from './projector.js';
export { cycleBlocksOrderIRs } from './irs.js';
export { cycleBlocksOrderStageView } from './cycle-blocks-order-stage.js';
export { cycleBlocksOrderFacet } from './facet.js';
export { cycleBlocksOrderDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { cycleBlocksOrder, type CycleBlocksOrderData } from './algorithm.js';
import { cycleBlocksOrderProjector } from './projector.js';
import { cycleBlocksOrderIRs } from './irs.js';
import { cycleBlocksOrderStageView } from './cycle-blocks-order-stage.js';
import { cycleBlocksOrderFacet } from './facet.js';
import { cycleBlocksOrderDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerCycleBlocksOrder(): void {
  registerAlgorithm<CycleBlocksOrderData>('cycleBlocksOrder', cycleBlocksOrder, {
    mechanismKind: 'reactive',
  });
  registerProjector('cycleBlocksOrderProjector', cycleBlocksOrderProjector);
  for (const ir of cycleBlocksOrderIRs) registerIR(ir.id, ir);
  registerView('cycle-blocks-order-stage', cycleBlocksOrderStageView);
  registerFacets([cycleBlocksOrderFacet]);
  registerDescription(cycleBlocksOrderFacet.id, cycleBlocksOrderDescription);
}
