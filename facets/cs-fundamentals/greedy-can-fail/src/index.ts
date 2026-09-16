/**
 * @ffacet/algorithm-greedy-can-fail — 그리디의 한계 조각(piece) facet 번들.
 *
 * 일곱 걸음을 자동으로 재생하고 멈춘다. 그 뒤 스크럽 띠로 어느 걸음이든 끌어 볼 수
 * 있다 — 화면을 명령이 아니라 장면으로 만들므로 되짚기가 앞으로 가기와 같은 연산이다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { greedyCanFail, type GreedyCanFailData } from './algorithm.js';
export {
  greedyCanFailScene,
  GREEDY_LANES,
  type GreedyCanFailCaption,
  type GreedyCanFailScene,
  type GreedyCanFailStep,
  type GreedyLane,
} from './scene.js';
export { greedyCanFailIRs } from './irs.js';
export { greedyCanFailFacet } from './facet.js';
export { greedyCanFailDescription } from './description.js';
export { greedyCanFailStageView } from './greedy-can-fail-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { greedyCanFail, type GreedyCanFailData } from './algorithm.js';
import { greedyCanFailScene } from './scene.js';
import { greedyCanFailIRs } from './irs.js';
import { greedyCanFailFacet } from './facet.js';
import { greedyCanFailDescription } from './description.js';
import { greedyCanFailStageView } from './greedy-can-fail-stage.js';

export function registerGreedyCanFail(): void {
  registerAlgorithm<GreedyCanFailData>('greedyCanFail', greedyCanFail, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('greedyCanFailScene', greedyCanFailScene);
  for (const ir of greedyCanFailIRs) registerIR(ir.id, ir);
  registerView('greedy-can-fail-stage', greedyCanFailStageView);
  registerFacets([greedyCanFailFacet]);
  registerDescription(greedyCanFailFacet.id, greedyCanFailDescription);
}
