/**
 * @facet/algorithm-array — 4-layer 배열 (Array) facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). 자동 시연 (read(3) → insert(1, "5")) 후 사용자
 * 입력 (read/write/insert/remove/append/search/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (array-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export { array, type ArrayFacetData, type ArrayInputEvent } from './algorithm.js';
export { arrayProjector } from './projector.js';
export { arrayIRs } from './irs.js';
export { arrayFacet } from './facet.js';
export { arrayDescription } from './description.js';
export { arrayStageView } from './array-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { array, type ArrayFacetData } from './algorithm.js';
import { arrayProjector } from './projector.js';
import { arrayIRs } from './irs.js';
import { arrayFacet } from './facet.js';
import { arrayDescription } from './description.js';
import { arrayStageView } from './array-stage.js';

/**
 * algorithm/projector/IR/view/facet/description 등록 헬퍼.
 *
 * 등록 순서는 S-facet 표준 (Algorithm → Projector → IR → Facets → Description).
 * facet 전용 View 는 Facets 직전에 끼운다 — facet JSON 의 block.type 이 마운트 시
 * 카탈로그를 조회하기 때문.
 */
export function registerArray(): void {
  registerAlgorithm<ArrayFacetData>('array', array, { mechanismKind: 'reactive' });
  registerProjector('arrayProjector', arrayProjector);
  for (const ir of arrayIRs) registerIR(ir.id, ir);
  registerView('array-stage', arrayStageView);
  registerFacets([arrayFacet]);
  registerDescription(arrayFacet.id, arrayDescription);
}
