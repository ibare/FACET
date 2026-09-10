/**
 * @ffacet/algorithm-tsne — t-SNE 완제품 번들.
 *
 * reactive. 마운트 직후 퍼플렉시티 15 로 한 호흡 펴 보이고, 그 뒤로는 퍼플렉시티
 * 손잡이(5 · 15 · 30)를 기다린다. 손잡이를 옮기면 처음부터 재생하는 것이 아니라
 * 그 값으로 다시 셈한 결과로 갈아 끼우고, 앞서 나온 답은 장부에 남는다.
 *
 * 코드 패널은 두지 않는다 — `irs.ts` 머리말에 그 까닭이 있다.
 */

export {
  tsne,
  measureLayout,
  highDimensionalP,
  mulberry32,
  runTsne,
  startTsneRun,
  type TsneData,
  type TsneInputEvent,
  type TsneRun,
  type LayoutMeasure,
} from './algorithm.js';
export { tsneProjector } from './projector.js';
export { tsneIRs } from './irs.js';
export { tsneFacet } from './facet.js';
export { tsneDescription } from './description.js';
export { tsneStageView, type LedgerRow, type PanelState } from './tsne-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { tsne, type TsneData } from './algorithm.js';
import { tsneProjector } from './projector.js';
import { tsneIRs } from './irs.js';
import { tsneFacet } from './facet.js';
import { tsneDescription } from './description.js';
import { tsneStageView } from './tsne-stage.js';

export function registerTsne(): void {
  registerAlgorithm<TsneData>('tsne', tsne, { mechanismKind: 'reactive' });
  registerProjector('tsneProjector', tsneProjector);
  for (const ir of tsneIRs) registerIR(ir.id, ir);
  registerView('tsne-stage', tsneStageView);
  registerFacets([tsneFacet]);
  registerDescription(tsneFacet.id, tsneDescription);
}
