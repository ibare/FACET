/**
 * relink-insert 조각의 등록 진입점.
 *
 * 부수효과로 스스로 등록하지 않는다 — 언제 등록할지는 호스트 앱이 정한다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { relinkInsertAlgorithm, type RelinkInsertData } from './algorithm.js';
import { relinkInsertProjector } from './projector.js';
import { relinkInsertIRs } from './irs.js';
import { relinkStageView } from './relink-stage.js';
import { relinkInsertFacet } from './facet.js';
import { relinkInsertDescription } from './description.js';

export { relinkInsertAlgorithm } from './algorithm.js';
export type { RelinkInsertData, RelinkNode } from './algorithm.js';
export { relinkInsertProjector } from './projector.js';
export { relinkInsertIRs } from './irs.js';
export { relinkStageView } from './relink-stage.js';
export type { RelinkStageSpec, RelinkStageNode } from './relink-stage.js';
export { relinkInsertFacet } from './facet.js';
export { relinkInsertDescription } from './description.js';

export function registerRelinkInsert(): void {
  registerAlgorithm<RelinkInsertData>('relinkInsert', relinkInsertAlgorithm, {
    // 컨트롤바 없이도 mount 시 스스로 재생하고, 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('relinkInsertProjector', relinkInsertProjector);
  for (const ir of relinkInsertIRs) registerIR(ir.id, ir);
  registerView('relink-insert-stage', relinkStageView);
  registerFacets([relinkInsertFacet]);
  registerDescription(relinkInsertFacet.id, relinkInsertDescription);
}
