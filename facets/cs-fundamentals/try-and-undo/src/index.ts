/**
 * @ffacet/algorithm-try-and-undo — 백트래킹 조각(piece) facet 번들.
 *
 * 열일곱 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을
 * 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { tryAndUndo, type TryAndUndoData } from './algorithm.js';
export { tryAndUndoProjector } from './projector.js';
export { tryAndUndoIRs } from './irs.js';
export { tryAndUndoFacet } from './facet.js';
export { tryAndUndoDescription } from './description.js';
export {
  tryAndUndoStageView,
  type TryAndUndoStageInit,
  type TryAndUndoPlaceSpec,
  type TryAndUndoBlockSpec,
  type TryAndUndoUndoSpec,
} from './try-and-undo-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { tryAndUndo, type TryAndUndoData } from './algorithm.js';
import { tryAndUndoProjector } from './projector.js';
import { tryAndUndoIRs } from './irs.js';
import { tryAndUndoFacet } from './facet.js';
import { tryAndUndoDescription } from './description.js';
import { tryAndUndoStageView } from './try-and-undo-stage.js';

export function registerTryAndUndo(): void {
  registerAlgorithm<TryAndUndoData>('tryAndUndo', tryAndUndo, {
    mechanismKind: 'reactive',
  });
  registerProjector('tryAndUndoProjector', tryAndUndoProjector);
  for (const ir of tryAndUndoIRs) registerIR(ir.id, ir);
  registerView('try-and-undo-stage', tryAndUndoStageView);
  registerFacets([tryAndUndoFacet]);
  registerDescription(tryAndUndoFacet.id, tryAndUndoDescription);
}
