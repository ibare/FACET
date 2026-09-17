/**
 * undo-by-back-edge 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { undoByBackEdgeAlgorithm, type UndoByBackEdgeData } from './algorithm.js';
import { undoByBackEdgeScene } from './scene.js';
import { undoByBackEdgeIRs } from './irs.js';
import { undoByBackEdgeStageView } from './undo-by-back-edge-stage.js';
import { undoByBackEdgeFacet } from './facet.js';

export function registerUndoByBackEdge(): void {
  registerAlgorithm<UndoByBackEdgeData>('undoByBackEdge', undoByBackEdgeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('undoByBackEdgeScene', undoByBackEdgeScene);
  for (const ir of undoByBackEdgeIRs) registerIR(ir.id, ir);
  registerView('undo-by-back-edge-stage', undoByBackEdgeStageView);
  registerFacets([undoByBackEdgeFacet]);
}

export { undoByBackEdgeAlgorithm } from './algorithm.js';
export type { UndoByBackEdgeData, UndoByBackEdgeEdge } from './algorithm.js';
export { undoByBackEdgeScene, type UndoByBackEdgeScene } from './scene.js';
export { undoByBackEdgeIRs } from './irs.js';
export { undoByBackEdgeStageView } from './undo-by-back-edge-stage.js';
export { undoByBackEdgeFacet } from './facet.js';
