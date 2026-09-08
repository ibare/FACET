/**
 * @ffacet/algorithm-push-pop-top — LIFO 조각 (piece) 번들.
 *
 * 한쪽 끝만 열린 통에 값이 쌓이고 걷히는 장면 하나. algorithm / projector /
 * stage view / facet JSON / description 을 함께 묶고 등록 헬퍼를 제공한다.
 * 등록 호출 책임은 호스트 앱에 있다 (여기서 사이드 이펙트로 부르지 않는다).
 */

export { pushPopTopAlgorithm, type PushPopTopData } from './algorithm.js';
export { pushPopTopProjector } from './projector.js';
export { pushPopTopIRs } from './irs.js';
export { pushPopTopStageView } from './push-pop-top-stage.js';
export { pushPopTopFacet } from './facet.js';
export { pushPopTopDescription } from './description.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { pushPopTopAlgorithm, type PushPopTopData } from './algorithm.js';
import { pushPopTopProjector } from './projector.js';
import { pushPopTopIRs } from './irs.js';
import { pushPopTopStageView } from './push-pop-top-stage.js';
import { pushPopTopFacet } from './facet.js';
import { pushPopTopDescription } from './description.js';

export function registerPushPopTop(): void {
  // 조각은 스스로 재생하고 걸음 간격도 스스로 정한다 → reactive (S-piece).
  registerAlgorithm<PushPopTopData>('pushPopTop', pushPopTopAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('pushPopTopProjector', pushPopTopProjector);
  for (const ir of pushPopTopIRs) registerIR(ir.id, ir);
  registerView('push-pop-top-stage', pushPopTopStageView);
  registerFacets([pushPopTopFacet]);
  registerDescription(pushPopTopFacet.id, pushPopTopDescription);
}
