/**
 * @facet/algorithm-linked-list — 4-layer 단일 연결 리스트 (Linked List) facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). 자동 시연 (insert(2, "25")) 후 사용자
 * 입력 (insert/remove/search/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (linked-list-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  linkedList,
  type LinkedListFacetData,
  type LinkedListInputEvent,
} from './algorithm.js';
export { linkedListProjector } from './projector.js';
export { linkedListIRs } from './irs.js';
export { linkedListFacet } from './facet.js';
export { linkedListDescription } from './description.js';
export { linkedListStageView } from './linked-list-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { linkedList, type LinkedListFacetData } from './algorithm.js';
import { linkedListProjector } from './projector.js';
import { linkedListIRs } from './irs.js';
import { linkedListFacet } from './facet.js';
import { linkedListDescription } from './description.js';
import { linkedListStageView } from './linked-list-stage.js';

export function registerLinkedList(): void {
  registerAlgorithm<LinkedListFacetData>('linkedList', linkedList, {
    mechanismKind: 'reactive',
  });
  registerProjector('linkedListProjector', linkedListProjector);
  for (const ir of linkedListIRs) registerIR(ir.id, ir);
  registerView('linked-list-stage', linkedListStageView);
  registerFacets([linkedListFacet]);
  registerDescription(linkedListFacet.id, linkedListDescription);
}
