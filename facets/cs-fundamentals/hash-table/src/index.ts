/**
 * @facet/algorithm-hash-table — 4-layer 해시 테이블 (분리 체이닝) facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). 자동 시연 (키 7개, 충돌 1회 의도) 후 사용자
 * 입력 (insert/search/remove/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (hash-table-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  hashTable,
  type HashTableFacetData,
  type HashTableInputEvent,
} from './algorithm.js';
export { hashTableProjector } from './projector.js';
export { hashTableIRs } from './irs.js';
export { hashTableFacet } from './facet.js';
export { hashTableDescription } from './description.js';
export { hashTableStageView } from './hash-table-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { hashTable, type HashTableFacetData } from './algorithm.js';
import { hashTableProjector } from './projector.js';
import { hashTableIRs } from './irs.js';
import { hashTableFacet } from './facet.js';
import { hashTableDescription } from './description.js';
import { hashTableStageView } from './hash-table-stage.js';

export function registerHashTable(): void {
  registerAlgorithm<HashTableFacetData>('hashTable', hashTable, {
    mechanismKind: 'reactive',
  });
  registerProjector('hashTableProjector', hashTableProjector);
  for (const ir of hashTableIRs) registerIR(ir.id, ir);
  registerView('hash-table-stage', hashTableStageView);
  registerFacets([hashTableFacet]);
  registerDescription(hashTableFacet.id, hashTableDescription);
}
