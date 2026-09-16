/**
 * @ffacet/algorithm-cycle-blocks-order — 조각(piece) facet 등록 진입점.
 *
 * 화면을 명령이 아니라 **장면**으로 만든다 — 걸음마다 이벤트를 상태로 옮기고, 그
 * 상태에서 화면을 그린다. 그래서 스크럽 띠로 어느 걸음이든 끌어 볼 수 있다 (S-scene).
 *
 * 호출 책임은 호스트에 있다. 이 파일은 사이드 이펙트로 등록하지 않는다 (S-facet).
 */

export {
  cycleBlocksOrder,
  remainingLoads,
  type CycleBlocksOrderData,
  type CycleBlocksOrderEdge,
} from './algorithm.js';
export {
  cycleBlocksOrderScene,
  type CycleBlocksOrderScene,
  type CycleBlocksOrderStep,
  type CycleBlocksOrderWait,
} from './scene.js';
export { cycleBlocksOrderIRs } from './irs.js';
export { cycleBlocksOrderStageView } from './cycle-blocks-order-stage.js';
export { cycleBlocksOrderFacet } from './facet.js';
export { cycleBlocksOrderDescription } from './description.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { cycleBlocksOrder, type CycleBlocksOrderData } from './algorithm.js';
import { cycleBlocksOrderScene } from './scene.js';
import { cycleBlocksOrderIRs } from './irs.js';
import { cycleBlocksOrderStageView } from './cycle-blocks-order-stage.js';
import { cycleBlocksOrderFacet } from './facet.js';
import { cycleBlocksOrderDescription } from './description.js';

/** algorithm / 장면 / IR / view / facet / description 등록 헬퍼. */
export function registerCycleBlocksOrder(): void {
  registerAlgorithm<CycleBlocksOrderData>('cycleBlocksOrder', cycleBlocksOrder, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('cycleBlocksOrderScene', cycleBlocksOrderScene);
  for (const ir of cycleBlocksOrderIRs) registerIR(ir.id, ir);
  registerView('cycle-blocks-order-stage', cycleBlocksOrderStageView);
  registerFacets([cycleBlocksOrderFacet]);
  registerDescription(cycleBlocksOrderFacet.id, cycleBlocksOrderDescription);
}
