/**
 * @facet/algorithm-stack — 4-layer 스택 (LIFO) facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). 자동 시연 (1·2·3 push) 후 사용자 입력
 * (push/pop/peek/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (stack-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export { stack, type StackFacetData, type StackInputEvent } from './algorithm.js';
export { stackProjector } from './projector.js';
export { stackIRs } from './irs.js';
export { stackFacet } from './facet.js';
export { stackDescription } from './description.js';
export { stackStageView } from './stack-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { stack, type StackFacetData } from './algorithm.js';
import { stackProjector } from './projector.js';
import { stackIRs } from './irs.js';
import { stackFacet } from './facet.js';
import { stackDescription } from './description.js';
import { stackStageView } from './stack-stage.js';

/**
 * algorithm/projector/IR/view/facet/description 등록 헬퍼.
 *
 * 등록 순서는 S-facet 표준 (Algorithm → Projector → IR → Facets → Description).
 * facet 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type 이 마운트 시
 * 카탈로그를 조회하기 때문.
 */
export function registerStack(): void {
  registerAlgorithm<StackFacetData>('stack', stack, { mechanismKind: 'reactive' });
  registerProjector('stackProjector', stackProjector);
  for (const ir of stackIRs) registerIR(ir.id, ir);
  registerView('stack-stage', stackStageView);
  registerFacets([stackFacet]);
  registerDescription(stackFacet.id, stackDescription);
}
