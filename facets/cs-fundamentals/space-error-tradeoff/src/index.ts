/**
 * @ffacet/algorithm-space-error-tradeoff — 자리와 오차의 맞바꿈 조각(piece) 번들.
 *
 * 같은 스트림을 폭 2 · 4 · 8 로 세 번 세고 멈춘다. 다시 보기와 스크럽 띠 외에는
 * 조작을 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export {
  spaceErrorTradeoffAlgorithm,
  type SpaceErrorTradeoffData,
} from './algorithm.js';
export {
  spaceErrorTradeoffScene,
  type SpaceErrorTradeoffScene,
  type SketchPass,
  type TradeoffStep,
  type TradeoffCaption,
} from './scene.js';
export { spaceErrorTradeoffIRs } from './irs.js';
export { spaceErrorTradeoffFacet } from './facet.js';
export { spaceErrorTradeoffStageView } from './space-error-tradeoff-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { spaceErrorTradeoffAlgorithm, type SpaceErrorTradeoffData } from './algorithm.js';
import { spaceErrorTradeoffScene } from './scene.js';
import { spaceErrorTradeoffIRs } from './irs.js';
import { spaceErrorTradeoffFacet } from './facet.js';
import { spaceErrorTradeoffStageView } from './space-error-tradeoff-stage.js';

export function registerSpaceErrorTradeoff(): void {
  registerAlgorithm<SpaceErrorTradeoffData>('spaceErrorTradeoff', spaceErrorTradeoffAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('spaceErrorTradeoffScene', spaceErrorTradeoffScene);
  for (const ir of spaceErrorTradeoffIRs) registerIR(ir.id, ir);
  registerView('space-error-tradeoff-stage', spaceErrorTradeoffStageView);
  registerFacets([spaceErrorTradeoffFacet]);
}
