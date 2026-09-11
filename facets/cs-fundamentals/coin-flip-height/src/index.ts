/**
 * @ffacet/algorithm-coin-flip-height — 층의 높이를 무엇이 정하는가 (조각).
 *
 * algorithm / projector / IR / facet JSON / description / stage view 를 함께 담고
 * 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { coinFlipHeight, type CoinFace, type CoinFlipHeightData } from './algorithm.js';
export { coinFlipHeightProjector } from './projector.js';
export { coinFlipHeightIRs } from './irs.js';
export { coinFlipHeightFacet } from './facet.js';
export { coinFlipHeightDescription } from './description.js';
export { coinFlipHeightStageView } from './coin-flip-height-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { coinFlipHeight, type CoinFlipHeightData } from './algorithm.js';
import { coinFlipHeightProjector } from './projector.js';
import { coinFlipHeightIRs } from './irs.js';
import { coinFlipHeightStageView } from './coin-flip-height-stage.js';
import { coinFlipHeightFacet } from './facet.js';
import { coinFlipHeightDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerCoinFlipHeight(): void {
  // 조각은 마운트하자마자 스스로 재생하고 걸음 간격도 스스로 정한다 — 그 둘을
  // 주는 것은 reactive 뿐이다 (S-piece).
  registerAlgorithm<CoinFlipHeightData>('coinFlipHeight', coinFlipHeight, {
    mechanismKind: 'reactive',
  });
  registerProjector('coinFlipHeightProjector', coinFlipHeightProjector);
  for (const ir of coinFlipHeightIRs) registerIR(ir.id, ir);
  registerView('coin-flip-height-stage', coinFlipHeightStageView);
  registerFacets([coinFlipHeightFacet]);
  registerDescription(coinFlipHeightFacet.id, coinFlipHeightDescription);
}
