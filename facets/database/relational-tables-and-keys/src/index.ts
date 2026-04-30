/**
 * @facet/algorithm-relational-tables-and-keys — 관계모델 테이블과 키 facet 번들.
 *
 * 정적 + 입력 반응형 (ReactiveMechanism). 자동 호버 시연 (FK 셀 1001 →
 * PK 셀 1003 한 번 강조) 후 사용자 입력 (toggle-pk / toggle-rejects /
 * auto-demo / reset) 을 시각 사건으로 매핑. 셀 단위 호버 인터랙션은 view
 * 가 SVG 마우스 이벤트로 직접 처리한다.
 *
 * algorithm / projector / facet JSON / description / 전용 view (tables-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  relationalTablesAndKeys,
  type TablesAndKeysFacetData,
  type TablesAndKeysInputEvent,
  type TableInit,
  type ColumnInit,
  type ColumnKind,
  type RowInit,
  type RelationInit,
  type RejectInit,
  type CandidateKeysInit,
  type AutoHoverStep,
} from './algorithm.js';
export { relationalTablesAndKeysProjector } from './projector.js';
export { relationalTablesAndKeysIRs } from './irs.js';
export { relationalTablesAndKeysFacet } from './facet.js';
export { relationalTablesAndKeysDescription } from './description.js';
export { tablesStageView } from './tables-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import {
  relationalTablesAndKeys,
  type TablesAndKeysFacetData,
} from './algorithm.js';
import { relationalTablesAndKeysProjector } from './projector.js';
import { relationalTablesAndKeysIRs } from './irs.js';
import { relationalTablesAndKeysFacet } from './facet.js';
import { relationalTablesAndKeysDescription } from './description.js';
import { tablesStageView } from './tables-stage.js';

export function registerRelationalTablesAndKeys(): void {
  registerAlgorithm<TablesAndKeysFacetData>(
    'relationalTablesAndKeys',
    relationalTablesAndKeys,
    { mechanismKind: 'reactive' },
  );
  registerProjector(
    'relationalTablesAndKeysProjector',
    relationalTablesAndKeysProjector,
  );
  for (const ir of relationalTablesAndKeysIRs) registerIR(ir.id, ir);
  registerView('tables-stage', tablesStageView);
  registerFacets([relationalTablesAndKeysFacet]);
  registerDescription(
    relationalTablesAndKeysFacet.id,
    relationalTablesAndKeysDescription,
  );
}
