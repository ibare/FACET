/**
 * 덜 뒤지면 놓친다 — 등록 진입점.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트 앱에 있다. 이 파일이 스스로 부르지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { recallSpeedTradeoffAlgorithm, type RecallSpeedTradeoffData } from './algorithm.js';
import { recallSpeedTradeoffIRs } from './irs.js';
import { recallSpeedTradeoffScene } from './scene.js';
import { recallSpeedTradeoffStageView } from './recall-speed-tradeoff-stage.js';
import { recallSpeedTradeoffFacet } from './facet.js';

export { recallSpeedTradeoffAlgorithm } from './algorithm.js';
export type { RecallPoint, RecallSpeedTradeoffData } from './algorithm.js';
export { recallSpeedTradeoffIRs } from './irs.js';
export { recallSpeedTradeoffStageView } from './recall-speed-tradeoff-stage.js';
export { recallSpeedTradeoffFacet } from './facet.js';
export { recallSpeedTradeoffScene } from './scene.js';
export type {
  RecallAnswer,
  RecallPhase,
  RecallScenePoint,
  RecallSeat,
  RecallSpeedTradeoffScene,
  RecallStep,
} from './scene.js';

export function registerRecallSpeedTradeoff(): void {
  // 조각은 스스로 시작하고 걸음 간격을 스스로 정해야 한다 — reactive 만 둘 다 준다.
  registerAlgorithm<RecallSpeedTradeoffData>('recallSpeedTradeoff', recallSpeedTradeoffAlgorithm, {
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 (C4).
  registerScenePlan('recallSpeedTradeoffScene', recallSpeedTradeoffScene);
  for (const ir of recallSpeedTradeoffIRs) registerIR(ir.id, ir);
  registerView('recall-speed-tradeoff-stage', recallSpeedTradeoffStageView);
  registerFacets([recallSpeedTradeoffFacet]);
}
