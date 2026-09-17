/**
 * assignThenMove 등록 진입점.
 *
 * 반응형(ReactiveMechanism). mount 하면 스스로 한 바퀴 돌고, 그 뒤로는 다시 보기와
 * 띠로 곱씹을 수 있다. 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든
 * 곧장 갈 수 있다 (S-scene).
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

import { assignThenMoveAlgorithm } from './algorithm.js';
import type { AssignThenMoveData } from './algorithm.js';
import { assignThenMoveStageView } from './assign-then-move-stage.js';
import { assignThenMoveFacet } from './facet.js';
import { assignThenMoveIRs } from './irs.js';
import { assignThenMoveScene } from './scene.js';

export { ASSIGN_SETTLE_EPS, assignThenMoveAlgorithm } from './algorithm.js';
export type { AssignThenMoveData, AssignThenMovePoint } from './algorithm.js';
export { assignThenMoveStageView } from './assign-then-move-stage.js';
export { assignThenMoveFacet } from './facet.js';
export { assignThenMoveIRs } from './irs.js';
export { assignThenMoveScene } from './scene.js';
export type {
  AssignThenMovePhase,
  AssignThenMoveScene,
  AssignThenMoveStep,
  ScenePt,
} from './scene.js';

export function registerAssignThenMove(): void {
  registerAlgorithm<AssignThenMoveData>('assignThenMove', assignThenMoveAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('assignThenMoveScene', assignThenMoveScene);
  for (const ir of assignThenMoveIRs) registerIR(ir.id, ir);
  registerView('assign-then-move-stage', assignThenMoveStageView);
  registerFacets([assignThenMoveFacet]);
}
