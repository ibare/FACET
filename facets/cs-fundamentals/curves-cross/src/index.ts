/**
 * @ffacet/algorithm-curves-cross — 점근 교차 조각(piece) facet 번들.
 *
 * 열한 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export {
  curvesCrossAlgorithm,
  computeCurvesCrossRows,
  findCrossing,
  type CurvesCrossData,
  type CostRow,
  type CostLead,
} from './algorithm.js';
export { curvesCrossProjector } from './projector.js';
export { curvesCrossIRs } from './irs.js';
export { curvesCrossFacet } from './facet.js';
export { curvesCrossDescription } from './description.js';
export {
  curvesCrossStageView,
  type CurvesCrossStageInstance,
  type CurvesCrossWeighRow,
} from './curves-cross-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { curvesCrossAlgorithm, type CurvesCrossData } from './algorithm.js';
import { curvesCrossProjector } from './projector.js';
import { curvesCrossIRs } from './irs.js';
import { curvesCrossFacet } from './facet.js';
import { curvesCrossDescription } from './description.js';
import { curvesCrossStageView } from './curves-cross-stage.js';

export function registerCurvesCross(): void {
  registerAlgorithm<CurvesCrossData>('curvesCross', curvesCrossAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('curvesCrossProjector', curvesCrossProjector);
  for (const ir of curvesCrossIRs) registerIR(ir.id, ir);
  registerView('curves-cross-stage', curvesCrossStageView);
  registerFacets([curvesCrossFacet]);
  registerDescription(curvesCrossFacet.id, curvesCrossDescription);
}
