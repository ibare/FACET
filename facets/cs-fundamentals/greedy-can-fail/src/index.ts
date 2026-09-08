/**
 * @ffacet/algorithm-greedy-can-fail — 그리디의 한계 조각(piece) facet 번들.
 *
 * 일곱 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { greedyCanFail, type GreedyCanFailData } from './algorithm.js';
export { greedyCanFailProjector } from './projector.js';
export { greedyCanFailIRs } from './irs.js';
export { greedyCanFailFacet } from './facet.js';
export { greedyCanFailDescription } from './description.js';
export {
  greedyCanFailStageView,
  type GreedyCanFailStageInit,
  type GreedyCanFailStagePick,
  type GreedyLane,
} from './greedy-can-fail-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { greedyCanFail, type GreedyCanFailData } from './algorithm.js';
import { greedyCanFailProjector } from './projector.js';
import { greedyCanFailIRs } from './irs.js';
import { greedyCanFailFacet } from './facet.js';
import { greedyCanFailDescription } from './description.js';
import { greedyCanFailStageView } from './greedy-can-fail-stage.js';

export function registerGreedyCanFail(): void {
  registerAlgorithm<GreedyCanFailData>('greedyCanFail', greedyCanFail, {
    mechanismKind: 'reactive',
  });
  registerProjector('greedyCanFailProjector', greedyCanFailProjector);
  for (const ir of greedyCanFailIRs) registerIR(ir.id, ir);
  registerView('greedy-can-fail-stage', greedyCanFailStageView);
  registerFacets([greedyCanFailFacet]);
  registerDescription(greedyCanFailFacet.id, greedyCanFailDescription);
}
