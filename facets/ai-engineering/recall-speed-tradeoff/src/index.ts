/**
 * 덜 뒤지면 놓친다 — 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다. 이 파일이 스스로 부르지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { recallSpeedTradeoffAlgorithm, type RecallSpeedTradeoffData } from './algorithm.js';
import { recallSpeedTradeoffProjector } from './projector.js';
import { recallSpeedTradeoffIRs } from './irs.js';
import { recallSpeedTradeoffStageView } from './recall-speed-tradeoff-stage.js';
import { recallSpeedTradeoffFacet } from './facet.js';
import { recallSpeedTradeoffDescription } from './description.js';

export { recallSpeedTradeoffAlgorithm } from './algorithm.js';
export type { RecallPoint, RecallSpeedTradeoffData } from './algorithm.js';
export { recallSpeedTradeoffProjector } from './projector.js';
export { recallSpeedTradeoffIRs } from './irs.js';
export { recallSpeedTradeoffStageView } from './recall-speed-tradeoff-stage.js';
export { recallSpeedTradeoffFacet } from './facet.js';
export { recallSpeedTradeoffDescription } from './description.js';

export function registerRecallSpeedTradeoff(): void {
  // 조각은 스스로 시작하고 걸음 간격을 스스로 정해야 한다 — reactive 만 둘 다 준다.
  registerAlgorithm<RecallSpeedTradeoffData>('recallSpeedTradeoff', recallSpeedTradeoffAlgorithm, {
    mechanismKind: 'reactive',
  });
  // projector 이름은 algorithm 과 겹치지 않는다 (C4).
  registerProjector('recallSpeedTradeoffProjector', recallSpeedTradeoffProjector);
  for (const ir of recallSpeedTradeoffIRs) registerIR(ir.id, ir);
  registerView('recall-speed-tradeoff-stage', recallSpeedTradeoffStageView);
  registerFacets([recallSpeedTradeoffFacet]);
  registerDescription(recallSpeedTradeoffFacet.id, recallSpeedTradeoffDescription);
}
