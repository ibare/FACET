/**
 * assignThenMove 등록 진입점.
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

import { assignThenMoveAlgorithm } from './algorithm.js';
import type { AssignThenMoveData } from './algorithm.js';
import { assignThenMoveStageView } from './assign-then-move-stage.js';
import { assignThenMoveDescription } from './description.js';
import { assignThenMoveFacet } from './facet.js';
import { assignThenMoveIRs } from './irs.js';
import { assignThenMoveProjector } from './projector.js';

export { assignThenMoveAlgorithm } from './algorithm.js';
export type { AssignThenMoveData, AssignThenMovePoint } from './algorithm.js';
export { assignThenMoveStageView } from './assign-then-move-stage.js';
export { assignThenMoveDescription } from './description.js';
export { assignThenMoveFacet } from './facet.js';
export { assignThenMoveIRs } from './irs.js';
export { assignThenMoveProjector } from './projector.js';

export function registerAssignThenMove(): void {
  registerAlgorithm<AssignThenMoveData>('assignThenMove', assignThenMoveAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('assignThenMoveProjector', assignThenMoveProjector);
  for (const ir of assignThenMoveIRs) registerIR(ir.id, ir);
  registerView('assign-then-move-stage', assignThenMoveStageView);
  registerFacets([assignThenMoveFacet]);
  registerDescription(assignThenMoveFacet.id, assignThenMoveDescription);
}
