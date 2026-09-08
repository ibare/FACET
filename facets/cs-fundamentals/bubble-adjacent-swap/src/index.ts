/**
 * @ffacet/algorithm-bubble-adjacent-swap — 조각(piece) facet 번들.
 *
 * "옆끼리만 견주는데도 가장 큰 것이 끝까지 간다" 한 주장만 말하고 멈춘다.
 * reactive 메커니즘이라 mount 하면 스스로 한 번 훑고, 컨트롤은 다시 보기 /
 * 한 걸음 둘뿐이다 (S-piece).
 *
 * 등록은 호스트(playground 등) 가 `registerBubbleAdjacentSwap()` 을 명시
 * 호출한다 — 이 파일은 import 만으로 아무것도 등록하지 않는다.
 */

export { bubbleAdjacentSwap, type BubbleAdjacentSwapData } from './algorithm.js';
export { bubbleAdjacentSwapProjector } from './projector.js';
export { bubbleAdjacentSwapIRs } from './irs.js';
export { bubbleAdjacentSwapFacet } from './facet.js';
export { bubbleAdjacentSwapDescription } from './description.js';
export { bubbleAdjacentSwapStageView } from './bubble-adjacent-swap-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { bubbleAdjacentSwap, type BubbleAdjacentSwapData } from './algorithm.js';
import { bubbleAdjacentSwapProjector } from './projector.js';
import { bubbleAdjacentSwapIRs } from './irs.js';
import { bubbleAdjacentSwapFacet } from './facet.js';
import { bubbleAdjacentSwapDescription } from './description.js';
import { bubbleAdjacentSwapStageView } from './bubble-adjacent-swap-stage.js';

/**
 * algorithm / projector / IR / view / facet / description 등록 헬퍼.
 *
 * 순서는 S-facet 표준. 전용 view 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 view 카탈로그를 조회하기 때문.
 */
export function registerBubbleAdjacentSwap(): void {
  registerAlgorithm<BubbleAdjacentSwapData>('bubbleAdjacentSwap', bubbleAdjacentSwap, {
    mechanismKind: 'reactive',
  });
  registerProjector('bubbleAdjacentSwapProjector', bubbleAdjacentSwapProjector);
  for (const ir of bubbleAdjacentSwapIRs) registerIR(ir.id, ir);
  registerView('bubble-adjacent-swap-stage', bubbleAdjacentSwapStageView);
  registerFacets([bubbleAdjacentSwapFacet]);
  registerDescription(bubbleAdjacentSwapFacet.id, bubbleAdjacentSwapDescription);
}
