/**
 * @ffacet/algorithm-try-and-undo — 백트래킹 조각(piece) facet 번들.
 *
 * 열일곱 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 띠 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 화면은 명령이 아니라 **장면**으로 만든다 — 걸음마다의 상태를 셈해 두므로 띠로
 * 어느 걸음이든 곧장 갈 수 있다 (S-scene).
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { tryAndUndo, type TryAndUndoData } from './algorithm.js';
// 장면에서 파생되는 셈(`forbiddenCells` 류)은 내보내지 않는다. 그리는 쪽이
// 패키지 안에서 직접 부르므로 공개 표면에 둘 까닭이 없다 (S-facet).
export {
  tryAndUndoScene,
  type TryAndUndoScene,
  type TryAndUndoStep,
  type TryAndUndoCaption,
} from './scene.js';
export { tryAndUndoIRs } from './irs.js';
export { tryAndUndoFacet } from './facet.js';
export { tryAndUndoDescription } from './description.js';
export { tryAndUndoStageView } from './try-and-undo-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { tryAndUndo, type TryAndUndoData } from './algorithm.js';
import { tryAndUndoScene } from './scene.js';
import { tryAndUndoIRs } from './irs.js';
import { tryAndUndoFacet } from './facet.js';
import { tryAndUndoDescription } from './description.js';
import { tryAndUndoStageView } from './try-and-undo-stage.js';

export function registerTryAndUndo(): void {
  registerAlgorithm<TryAndUndoData>('tryAndUndo', tryAndUndo, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('tryAndUndoScene', tryAndUndoScene);
  for (const ir of tryAndUndoIRs) registerIR(ir.id, ir);
  registerView('try-and-undo-stage', tryAndUndoStageView);
  registerFacets([tryAndUndoFacet]);
  registerDescription(tryAndUndoFacet.id, tryAndUndoDescription);
}
