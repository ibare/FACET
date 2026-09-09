/**
 * @ffacet/algorithm-queue-vs-stack-order — 탐색이 쓰는 그릇 조각(piece) 번들.
 *
 * 열두 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을
 * 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { queueVsStackOrderAlgorithm, type QueueVsStackOrderData } from './algorithm.js';
export { queueVsStackOrderProjector } from './projector.js';
export { queueVsStackOrderIRs } from './irs.js';
export { queueVsStackOrderFacet } from './facet.js';
export { queueVsStackOrderDescription } from './description.js';
export {
  queueVsStackOrderStageView,
  type QueueVsStackOrderStageInstance,
} from './queue-vs-stack-order-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { queueVsStackOrderAlgorithm, type QueueVsStackOrderData } from './algorithm.js';
import { queueVsStackOrderProjector } from './projector.js';
import { queueVsStackOrderIRs } from './irs.js';
import { queueVsStackOrderFacet } from './facet.js';
import { queueVsStackOrderDescription } from './description.js';
import { queueVsStackOrderStageView } from './queue-vs-stack-order-stage.js';

export function registerQueueVsStackOrder(): void {
  registerAlgorithm<QueueVsStackOrderData>('queueVsStackOrder', queueVsStackOrderAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('queueVsStackOrderProjector', queueVsStackOrderProjector);
  for (const ir of queueVsStackOrderIRs) registerIR(ir.id, ir);
  registerView('queue-vs-stack-order-stage', queueVsStackOrderStageView);
  registerFacets([queueVsStackOrderFacet]);
  registerDescription(queueVsStackOrderFacet.id, queueVsStackOrderDescription);
}
