/**
 * @ffacet/algorithm-traversal-order — 순회 순서 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 세 차례를 스스로 밟고 멈추며, 다시 보기와 띠 외에는
 * 조작을 받지 않는다. 화면은 명령이 아니라 장면에서 만들어지므로 어느 걸음으로든
 * 곧장 갈 수 있다 (S-scene).
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 register 를 부르지
 * 않는다 (S-facet).
 */

export {
  traversalOrder,
  isTraversalMoment,
  type TraversalMoment,
  type TraversalOrderData,
} from './algorithm.js';
export {
  traversalOrderScene,
  activeOrderOf,
  type TraversalOrderScene,
  type TraversalOrderStep,
  type TraversalOrderTouch,
} from './scene.js';
export { traversalOrderIRs } from './irs.js';
export { traversalOrderFacet } from './facet.js';
export { traversalOrderStageView } from './traversal-order-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { traversalOrder, type TraversalOrderData } from './algorithm.js';
import { traversalOrderScene } from './scene.js';
import { traversalOrderIRs } from './irs.js';
import { traversalOrderFacet } from './facet.js';
import { traversalOrderStageView } from './traversal-order-stage.js';

export function registerTraversalOrder(): void {
  registerAlgorithm<TraversalOrderData>('traversalOrder', traversalOrder, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('traversalOrderScene', traversalOrderScene);
  for (const ir of traversalOrderIRs) registerIR(ir.id, ir);
  registerView('traversal-order-stage', traversalOrderStageView);
  registerFacets([traversalOrderFacet]);
}
