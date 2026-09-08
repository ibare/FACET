/**
 * @ffacet/algorithm-take-best-now — 그리디 선택 조각 번들.
 *
 * algorithm / projector / IR(빈 배열) / 전용 view(take-best-now-stage) /
 * facet JSON / description 을 함께 묶고 등록 헬퍼를 제공한다.
 *
 * 조각이므로 reactive 로 돌고 (mount 즉시 스스로 재생), 컨트롤은
 * 다시 보기 · 한 걸음 둘뿐이다 (S-piece).
 */

export { takeBestNow, type TakeBestNowData } from './algorithm.js';
export { takeBestNowProjector } from './projector.js';
export { takeBestNowIRs } from './irs.js';
export { takeBestNowFacet } from './facet.js';
export { takeBestNowDescription } from './description.js';
export { takeBestNowStageView } from './take-best-now-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { takeBestNow, type TakeBestNowData } from './algorithm.js';
import { takeBestNowProjector } from './projector.js';
import { takeBestNowIRs } from './irs.js';
import { takeBestNowFacet } from './facet.js';
import { takeBestNowDescription } from './description.js';
import { takeBestNowStageView } from './take-best-now-stage.js';

/**
 * algorithm/projector/IR/view/facet/description 등록 헬퍼.
 *
 * 등록 순서는 S-facet 표준. 전용 View 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerTakeBestNow(): void {
  registerAlgorithm<TakeBestNowData>('takeBestNow', takeBestNow, {
    mechanismKind: 'reactive',
  });
  registerProjector('takeBestNowProjector', takeBestNowProjector);
  for (const ir of takeBestNowIRs) registerIR(ir.id, ir);
  registerView('take-best-now-stage', takeBestNowStageView);
  registerFacets([takeBestNowFacet]);
  registerDescription(takeBestNowFacet.id, takeBestNowDescription);
}
