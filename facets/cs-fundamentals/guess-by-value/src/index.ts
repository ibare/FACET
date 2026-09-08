/**
 * @ffacet/algorithm-guess-by-value — 보간 추정 조각(piece) facet 번들.
 *
 * 두 방식이 같은 배열을 훑는 아홉 걸음을 자동으로 재생하고 멈춘다. 다시 보기와
 * 한 걸음 외에는 조작을 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { guessByValueAlgorithm, type GuessByValueData } from './algorithm.js';
export { guessByValueProjector } from './projector.js';
export { guessByValueIRs } from './irs.js';
export { guessByValueFacet } from './facet.js';
export { guessByValueDescription } from './description.js';
export {
  guessByValueStageView,
  type GuessByValueLane,
  type GuessByValueStageInstance,
} from './guess-by-value-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { guessByValueAlgorithm, type GuessByValueData } from './algorithm.js';
import { guessByValueProjector } from './projector.js';
import { guessByValueIRs } from './irs.js';
import { guessByValueFacet } from './facet.js';
import { guessByValueDescription } from './description.js';
import { guessByValueStageView } from './guess-by-value-stage.js';

export function registerGuessByValue(): void {
  registerAlgorithm<GuessByValueData>('guessByValue', guessByValueAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('guessByValueProjector', guessByValueProjector);
  for (const ir of guessByValueIRs) registerIR(ir.id, ir);
  registerView('guess-by-value-stage', guessByValueStageView);
  registerFacets([guessByValueFacet]);
  registerDescription(guessByValueFacet.id, guessByValueDescription);
}
