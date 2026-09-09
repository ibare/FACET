/**
 * undo-by-back-edge 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { undoByBackEdgeAlgorithm, type UndoByBackEdgeData } from './algorithm.js';
import { undoByBackEdgeProjector } from './projector.js';
import { undoByBackEdgeIRs } from './irs.js';
import { undoByBackEdgeStageView } from './undo-by-back-edge-stage.js';
import { undoByBackEdgeFacet } from './facet.js';
import { undoByBackEdgeDescription } from './description.js';

export function registerUndoByBackEdge(): void {
  registerAlgorithm<UndoByBackEdgeData>('undoByBackEdge', undoByBackEdgeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('undoByBackEdgeProjector', undoByBackEdgeProjector);
  for (const ir of undoByBackEdgeIRs) registerIR(ir.id, ir);
  registerView('undo-by-back-edge-stage', undoByBackEdgeStageView);
  registerFacets([undoByBackEdgeFacet]);
  registerDescription(undoByBackEdgeFacet.id, undoByBackEdgeDescription);
}

export { undoByBackEdgeAlgorithm } from './algorithm.js';
export type { UndoByBackEdgeData, UndoByBackEdgeEdge } from './algorithm.js';
export { undoByBackEdgeProjector } from './projector.js';
export { undoByBackEdgeIRs } from './irs.js';
export { undoByBackEdgeStageView } from './undo-by-back-edge-stage.js';
export { undoByBackEdgeFacet } from './facet.js';
export { undoByBackEdgeDescription } from './description.js';
