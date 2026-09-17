/**
 * @ffacet/algorithm-coin-flip-height — 층의 높이를 무엇이 정하는가 (조각).
 *
 * algorithm / scene / IR / facet JSON / stage view 를 함께 담고
 * 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 *
 * 걸음마다 화면을 장면(Scene) 으로 잡으므로 띠를 끌어 어느 걸음으로든 갈 수
 * 있다 (S-scene).
 */

export { coinFlipHeight, type CoinFace, type CoinFlipHeightData } from './algorithm.js';
export {
  coinFlipHeightScene,
  heightOf,
  levelCountsOf,
  MAX_LEVEL_CAP,
  type CoinFlipHeightPhase,
  type CoinFlipHeightScene,
  type CoinFlipHeightStep,
  type CoinToss,
  type CoinTower,
} from './scene.js';
export { coinFlipHeightIRs } from './irs.js';
export { coinFlipHeightFacet } from './facet.js';
export { coinFlipHeightStageView } from './coin-flip-height-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { coinFlipHeight, type CoinFlipHeightData } from './algorithm.js';
import { coinFlipHeightScene } from './scene.js';
import { coinFlipHeightIRs } from './irs.js';
import { coinFlipHeightStageView } from './coin-flip-height-stage.js';
import { coinFlipHeightFacet } from './facet.js';

/** algorithm / scene / IR / view / facet 등록 헬퍼. */
export function registerCoinFlipHeight(): void {
  // 조각은 마운트하자마자 스스로 재생하고 걸음 간격도 스스로 정한다 — 그 둘을
  // 주는 것은 reactive 뿐이다 (S-piece).
  registerAlgorithm<CoinFlipHeightData>('coinFlipHeight', coinFlipHeight, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('coinFlipHeightScene', coinFlipHeightScene);
  for (const ir of coinFlipHeightIRs) registerIR(ir.id, ir);
  registerView('coin-flip-height-stage', coinFlipHeightStageView);
  registerFacets([coinFlipHeightFacet]);
}
